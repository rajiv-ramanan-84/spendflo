import crypto from 'crypto';

/**
 * Generate a secure API key
 * Format: sfb_{env}_{random32chars}
 */
export function generateApiKey(env: 'test' | 'live' = 'live'): {
  key: string;
  prefix: string;
} {
  // Generate 32 random bytes
  const randomBytes = crypto.randomBytes(32);

  // Encode as base64url (URL-safe)
  const randomString = randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .substring(0, 32);

  // Format: sfb_live_xxx or sfb_test_xxx
  const key = `sfb_${env}_${randomString}`;

  // Prefix for display (first 17 chars)
  const prefix = key.substring(0, 17);

  return { key, prefix };
}

/**
 * Hash an API key for storage
 * In production, use bcrypt. For now, SHA-256
 */
export function hashApiKey(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Verify an API key against a hash
 */
export function verifyApiKey(key: string, hash: string): boolean {
  const keyHash = hashApiKey(key);
  return keyHash === hash;
}

/**
 * Extract prefix from API key
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 17);
}

/**
 * Mask API key for display
 * Example: sfb_live_abc...xyz
 */
export function maskApiKey(key: string): string {
  if (key.length < 20) return key;
  const prefix = key.substring(0, 13);
  const suffix = key.substring(key.length - 3);
  return `${prefix}...${suffix}`;
}
