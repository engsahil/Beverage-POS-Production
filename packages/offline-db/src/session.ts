/**
 * Phase 16: Session Management Module
 * 
 * Manages the authenticated cashier session context for offline operation.
 * 
 * Security notes:
 * - Does NOT store passwords
 * - Does NOT store JWT tokens (those are in memory/HTTP-only cookies)
 * - Only stores session context needed for offline operation
 * - Session data is isolated by business/branch
 */

import {
  STORES,
  getRecord,
  putRecord,
  deleteRecord,
} from './database.js';
import type { CachedSession } from './types.js';

const SESSION_KEY = 'active-session';

/**
 * Save cashier session context to local storage
 * Called after successful authentication
 */
export async function saveSession(
  db: IDBDatabase,
  session: Omit<CachedSession, 'id' | 'lastActivityAt'>
): Promise<CachedSession> {
  const fullSession: CachedSession = {
    ...session,
    id: SESSION_KEY,
    lastActivityAt: new Date().toISOString(),
  };

  await putRecord(db, STORES.SESSION, fullSession);
  return fullSession;
}

/**
 * Get active session
 */
export async function getActiveSession(
  db: IDBDatabase
): Promise<CachedSession | null> {
  return getRecord<CachedSession>(db, STORES.SESSION, SESSION_KEY);
}

/**
 * Update session activity timestamp
 */
export async function updateSessionActivity(
  db: IDBDatabase
): Promise<void> {
  const session = await getActiveSession(db);
  if (session) {
    session.lastActivityAt = new Date().toISOString();
    await putRecord(db, STORES.SESSION, session);
  }
}

/**
 * Update active shift information
 */
export async function updateSessionShift(
  db: IDBDatabase,
  shiftId: string | null,
  shiftNumber: string | null,
  openingCash: string | null
): Promise<void> {
  const session = await getActiveSession(db);
  if (!session) {
    throw new Error('No active session');
  }

  session.activeShiftId = shiftId;
  session.activeShiftNumber = shiftNumber;
  session.shiftOpeningCash = openingCash;
  session.lastActivityAt = new Date().toISOString();

  await putRecord(db, STORES.SESSION, session);
}

/**
 * Clear session on logout
 * IMPORTANT: This does NOT clear pending queue operations
 * Pending operations remain for the next login to sync
 */
export async function clearSession(db: IDBDatabase): Promise<void> {
  await deleteRecord(db, STORES.SESSION, SESSION_KEY);
}

/**
 * Check if session is valid (not expired)
 * Session expires after specified minutes of inactivity
 */
export async function isSessionValid(
  db: IDBDatabase,
  timeoutMinutes: number = 480 // 8 hours default
): Promise<boolean> {
  const session = await getActiveSession(db);
  if (!session) return false;

  const lastActivity = new Date(session.lastActivityAt).getTime();
  const now = Date.now();
  const timeoutMs = timeoutMinutes * 60 * 1000;

  return (now - lastActivity) < timeoutMs;
}

/**
 * Check if user has specific permission
 */
export async function hasPermission(
  db: IDBDatabase,
  permission: string
): Promise<boolean> {
  const session = await getActiveSession(db);
  if (!session) return false;

  // Check for wildcard permission (admin)
  if (session.permissions.includes('*')) return true;

  // Check specific permission
  return session.permissions.includes(permission);
}

/**
 * Check if session belongs to specific business
 */
export async function isSessionForBusiness(
  db: IDBDatabase,
  businessId: string
): Promise<boolean> {
  const session = await getActiveSession(db);
  if (!session) return false;

  return session.businessId === businessId;
}

/**
 * Check if session belongs to specific branch
 */
export async function isSessionForBranch(
  db: IDBDatabase,
  branchId: string
): Promise<boolean> {
  const session = await getActiveSession(db);
  if (!session) return false;

  return session.branchId === branchId;
}

/**
 * Get session context for API requests
 * Returns minimal context needed for API calls
 */
export async function getSessionContext(db: IDBDatabase): Promise<{
  userId: string;
  businessId: string;
  branchId: string | null;
  permissions: string[];
} | null> {
  const session = await getActiveSession(db);
  if (!session) return null;

  return {
    userId: session.userId,
    businessId: session.businessId,
    branchId: session.branchId,
    permissions: session.permissions,
  };
}
