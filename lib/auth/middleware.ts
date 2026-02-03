import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';
import { hasPermission, hasAnyPermission, Permission, Role } from './permissions';
import { prisma } from '@/lib/prisma';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    customerId: string;
  };
  customer: {
    id: string;
    name: string;
    domain: string;
  };
  permissions: string[];
}

export interface AuthOptions {
  roles?: Role[];
  permissions?: Permission[];
  requireAll?: boolean; // If true, user must have ALL permissions. If false, ANY permission is enough
}

/**
 * Authentication middleware for API routes
 * Usage:
 *
 * export const POST = withAuth(
 *   async (req, context) => {
 *     // Your handler code with authenticated context
 *   },
 *   { roles: ['fpa_admin'], permissions: ['budget.create'] }
 * );
 */
export function withAuth(
  handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify JWT token
      const payload = verifyToken(token);
      if (!payload) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Fetch user from database
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        include: { customer: true },
      });

      if (!user || !user.isActive) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'User not found or inactive' },
          { status: 401 }
        );
      }

      // Check role requirement
      if (options.roles && !options.roles.includes(user.role as Role)) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Insufficient role' },
          { status: 403 }
        );
      }

      // Check permission requirements
      if (options.permissions && options.permissions.length > 0) {
        const hasRequiredPerms = options.requireAll
          ? options.permissions.every(perm => hasPermission(user.role as Role, perm, user.permissions))
          : hasAnyPermission(user.role as Role, options.permissions, user.permissions);

        if (!hasRequiredPerms) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Insufficient permissions' },
            { status: 403 }
          );
        }
      }

      // Build auth context
      const context: AuthContext = {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          customerId: user.customerId,
        },
        customer: {
          id: user.customer.id,
          name: user.customer.name,
          domain: user.customer.domain,
        },
        permissions: user.permissions,
      };

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Call the actual handler with context
      return handler(req, context);
    } catch (error: any) {
      console.error('[Auth Middleware] Error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }
  };
}

/**
 * API Key authentication middleware
 * For system-to-system integrations
 */
export function withApiKey(
  handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      // Extract API key from Authorization header
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
          { status: 401 }
        );
      }

      const apiKey = authHeader.substring(7);

      // Extract key prefix for lookup
      const keyPrefix = apiKey.substring(0, 16); // "sk_live_" + first 8 chars

      // Find API key in database
      const apiKeyRecord = await prisma.apiKey.findFirst({
        where: {
          keyPrefix,
          status: 'active',
        },
        include: {
          customer: true,
          createdBy: true,
        },
      });

      if (!apiKeyRecord) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid API key' },
          { status: 401 }
        );
      }

      // Verify full API key (in production, use bcrypt.compare)
      // For now, direct comparison (should hash in production)
      if (apiKeyRecord.key !== apiKey) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'Invalid API key' },
          { status: 401 }
        );
      }

      // Check expiration
      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'API key expired' },
          { status: 401 }
        );
      }

      // Check permission requirements
      if (options.permissions && options.permissions.length > 0) {
        const hasRequiredPerms = options.requireAll
          ? options.permissions.every(perm => apiKeyRecord.permissions.includes(perm))
          : options.permissions.some(perm => apiKeyRecord.permissions.includes(perm));

        if (!hasRequiredPerms) {
          return NextResponse.json(
            { error: 'Forbidden', message: 'Insufficient API key permissions' },
            { status: 403 }
          );
        }
      }

      // Build auth context
      const context: AuthContext = {
        user: {
          id: apiKeyRecord.createdBy.id,
          email: apiKeyRecord.createdBy.email,
          name: apiKeyRecord.name, // API key name
          role: 'api_system' as Role,
          customerId: apiKeyRecord.customerId,
        },
        customer: {
          id: apiKeyRecord.customer.id,
          name: apiKeyRecord.customer.name,
          domain: apiKeyRecord.customer.domain,
        },
        permissions: apiKeyRecord.permissions,
      };

      // Log API key usage
      await prisma.$transaction([
        prisma.apiKey.update({
          where: { id: apiKeyRecord.id },
          data: {
            usageCount: { increment: 1 },
            lastUsedAt: new Date(),
          },
        }),
        prisma.apiKeyUsageLog.create({
          data: {
            apiKeyId: apiKeyRecord.id,
            endpoint: req.nextUrl.pathname,
            method: req.method,
            statusCode: 200, // Will be updated on response
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        }),
      ]);

      // Call the actual handler with context
      return handler(req, context);
    } catch (error: any) {
      console.error('[API Key Middleware] Error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', message: error.message },
        { status: 500 }
      );
    }
  };
}

/**
 * Dual authentication middleware (JWT or API Key)
 * Tries JWT first, falls back to API Key
 */
export function withAuthOrApiKey(
  handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Try JWT first
    const jwtPayload = verifyToken(token);
    if (jwtPayload) {
      return withAuth(handler, options)(req);
    }

    // Fall back to API key
    return withApiKey(handler, options)(req);
  };
}
