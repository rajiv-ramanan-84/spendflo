import { prisma } from '@/lib/prisma';
import { verifyApiKey, getKeyPrefix } from './generator';

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKeyId?: string;
  customerId?: string;
  permissions?: string[];
  error?: string;
}

/**
 * Validate an API key
 */
export async function validateApiKey(key: string): Promise<ApiKeyValidationResult> {
  try {
    // Extract prefix for lookup
    const prefix = getKeyPrefix(key);

    // Find API key in database
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyPrefix: prefix,
        status: 'active',
      },
    });

    if (!apiKey) {
      return {
        valid: false,
        error: 'Invalid API key',
      };
    }

    // Verify full key
    const isValid = verifyApiKey(key, apiKey.key);
    if (!isValid) {
      return {
        valid: false,
        error: 'Invalid API key',
      };
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return {
        valid: false,
        error: 'API key expired',
      };
    }

    return {
      valid: true,
      apiKeyId: apiKey.id,
      customerId: apiKey.customerId,
      permissions: apiKey.permissions,
    };
  } catch (error: any) {
    console.error('[API Key Validation] Error:', error);
    return {
      valid: false,
      error: 'Validation error',
    };
  }
}

/**
 * Log API key usage
 */
export async function logApiKeyUsage(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  try {
    await prisma.$transaction([
      // Update usage count and last used timestamp
      prisma.apiKey.update({
        where: { id: apiKeyId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      }),
      // Create usage log
      prisma.apiKeyUsageLog.create({
        data: {
          apiKeyId,
          endpoint,
          method,
          statusCode,
          ipAddress,
          userAgent,
        },
      }),
    ]);
  } catch (error) {
    console.error('[API Key Usage Log] Error:', error);
    // Don't throw - logging should not break the request
  }
}
