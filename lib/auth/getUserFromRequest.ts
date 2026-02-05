/**
 * User Authentication Utility
 *
 * This utility extracts user information from the request.
 * It's designed to be integrated with Spendflo's existing auth system.
 *
 * INTEGRATION INSTRUCTIONS:
 * Replace the placeholder implementation with your actual auth logic.
 */

import { NextRequest } from 'next/server';

export interface SpendFloUser {
  id: string;
  email: string;
  name: string;
  department?: string;
  role?: string;
  customerId: string; // The organization/customer this user belongs to
}

/**
 * Extract authenticated user from request
 *
 * @param req - Next.js request object
 * @returns User object or null if not authenticated
 *
 * SPENDFLO INTEGRATION NOTES:
 * - Replace this implementation with your existing auth logic
 * - Examples of what to replace:
 *   1. If using NextAuth: import { getServerSession } from "next-auth"
 *   2. If using Clerk: import { auth } from "@clerk/nextjs"
 *   3. If using custom JWT: decode from cookies/headers
 *   4. If using session cookies: extract from request.cookies
 */
export async function getUserFromRequest(req: NextRequest): Promise<SpendFloUser | null> {
  // PLACEHOLDER IMPLEMENTATION - REPLACE WITH SPENDFLO'S AUTH

  try {
    // OPTION 1: NextAuth.js
    // const session = await getServerSession();
    // if (!session?.user) return null;
    // return {
    //   id: session.user.id,
    //   email: session.user.email,
    //   name: session.user.name,
    //   customerId: session.user.customerId,
    //   department: session.user.department,
    //   role: session.user.role,
    // };

    // OPTION 2: Clerk
    // const { userId } = auth();
    // if (!userId) return null;
    // const user = await currentUser();
    // return {
    //   id: user.id,
    //   email: user.emailAddresses[0].emailAddress,
    //   name: user.fullName,
    //   customerId: user.publicMetadata.customerId,
    //   department: user.publicMetadata.department,
    //   role: user.publicMetadata.role,
    // };

    // OPTION 3: Custom JWT from cookie
    // const token = req.cookies.get('spendflo_session')?.value;
    // if (!token) return null;
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // return {
    //   id: decoded.userId,
    //   email: decoded.email,
    //   name: decoded.name,
    //   customerId: decoded.customerId,
    //   department: decoded.department,
    //   role: decoded.role,
    // };

    // OPTION 4: Custom session from cookie
    // const sessionId = req.cookies.get('spendflo_sid')?.value;
    // if (!sessionId) return null;
    // const session = await getSessionFromDB(sessionId);
    // return session.user;

    // FOR DEVELOPMENT/TESTING - Remove this in production
    console.warn('[Auth] Using mock user - Replace with Spendflo auth');
    return {
      id: 'dev-user-123',
      email: 'dev@spendflo.com',
      name: 'Development User',
      customerId: 'cml7sl8ph00008j2nk5qr8zxn', // Acme Corporation
      department: 'Engineering',
      role: 'employee',
    };

  } catch (error) {
    console.error('[Auth] Failed to get user from request:', error);
    return null;
  }
}

/**
 * Require authenticated user or throw error
 */
export async function requireUser(req: NextRequest): Promise<SpendFloUser> {
  const user = await getUserFromRequest(req);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
