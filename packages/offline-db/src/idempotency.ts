/**
 * Phase 16: Idempotency Key Generation
 * 
 * Generates stable, unique idempotency keys for offline operations.
 * Keys must survive:
 * - Browser refresh
 * - Application restart
 * - Offline periods
 * - Device reboots
 * 
 * The server uses these keys to prevent duplicate processing.
 */

/**
 * Generate a stable idempotency key for an operation
 * Format: {operationType}-{entityType}-{entityRef}-{businessId}-{timestamp}-{random}
 */
export function generateIdempotencyKey(
  operationType: string,
  entityType: string,
  entityReference: string,
  businessId: string
): string {
  const timestamp = Date.now().toString(36);
  const randomPart = generateRandomString(8);
  
  return `${operationType}-${entityType}-${entityReference}-${businessId}-${timestamp}-${randomPart}`;
}

/**
 * Generate a device-specific idempotency key
 * Includes device ID for additional uniqueness across devices
 */
export function generateDeviceIdempotencyKey(
  operationType: string,
  entityType: string,
  entityReference: string,
  businessId: string,
  deviceId: string
): string {
  const timestamp = Date.now().toString(36);
  const randomPart = generateRandomString(6);
  
  return `${operationType}-${entityType}-${deviceId}-${businessId}-${timestamp}-${randomPart}`;
}

/**
 * Parse an idempotency key into its components
 */
export function parseIdempotencyKey(key: string): {
  operationType: string;
  entityType: string;
  entityReference: string;
  businessId: string;
  timestamp: string;
  random: string;
} | null {
  const parts = key.split('-');
  if (parts.length < 6) return null;

  return {
    operationType: parts[0],
    entityType: parts[1],
    entityReference: parts[2],
    businessId: parts[3],
    timestamp: parts[4],
    random: parts.slice(5).join('-'),
  };
}

/**
 * Generate a stable device identifier
 * Stored in localStorage, persists across sessions
 * This is NOT a fingerprint - just a stable random ID
 */
export function getOrCreateDeviceId(): string {
  const STORAGE_KEY = 'beverage-pos-device-id';
  
  try {
    let deviceId = localStorage.getItem(STORAGE_KEY);
    
    if (!deviceId) {
      deviceId = `device-${generateRandomString(16)}`;
      localStorage.setItem(STORAGE_KEY, deviceId);
    }
    
    return deviceId;
  } catch (error) {
    // localStorage not available (e.g., private browsing)
    // Generate a session-only ID
    return `device-session-${generateRandomString(16)}`;
  }
}

/**
 * Generate a random string of specified length
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

/**
 * Validate that an idempotency key is well-formed
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length < 20) return false;
  
  const parts = key.split('-');
  return parts.length >= 6;
}
