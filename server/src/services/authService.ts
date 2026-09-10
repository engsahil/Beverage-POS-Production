import prisma from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { hashPassword, verifyPassword } from '../utils/hashing.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '../utils/tokens.js';
import { createAuditLog, AuditActions } from './auditService.js';
import { logger } from '../lib/logger.js';

export interface LoginCredentials {
  username: string;
  password: string;
  businessId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    roleId: string | null;
    roleName: string | null;
    branchId: string | null;
    branchName: string | null;
    businessId: string;
    businessName: string;
    permissions: string[];
  };
}

/**
 * Authenticate a user and return tokens
 */
export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  const { username, password, businessId, ipAddress, userAgent } = credentials;

  // Find user by username (optionally scoped to business)
  const user = await prisma.user.findFirst({
    where: {
      username,
      ...(businessId ? { businessId } : {}),
    },
    include: {
      business: true,
      branch: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  // Check if user exists
  if (!user) {
    // Log failed attempt (without revealing if user exists)
    if (businessId) {
      await createAuditLog({
        businessId,
        action: AuditActions.USER_LOGIN_FAILED,
        entityType: 'user',
        ipAddress,
        userAgent,
        metadata: { username, reason: 'User not found' },
      });
    }
    throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await createAuditLog({
      businessId: user.businessId,
      userId: user.id,
      action: AuditActions.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: { reason: 'Account locked' },
    });
    throw new AuthError(
      'Account is temporarily locked due to too many failed attempts',
      'ACCOUNT_LOCKED'
    );
  }

  // Check if account is active
  if (!user.isActive) {
    await createAuditLog({
      businessId: user.businessId,
      userId: user.id,
      action: AuditActions.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: { reason: 'Account disabled' },
    });
    throw new AuthError('Account has been disabled', 'ACCOUNT_DISABLED');
  }

  // Verify password
  const isPasswordValid = await verifyPassword(password, user.passwordHash);

  if (!isPasswordValid) {
    // Increment login attempts
    const loginAttempts = user.loginAttempts + 1;
    const shouldLock = loginAttempts >= config.MAX_LOGIN_ATTEMPTS;

    const updateData: Record<string, unknown> = {
      loginAttempts,
    };

    if (shouldLock) {
      updateData.lockedUntil = new Date(
        Date.now() + config.LOCKOUT_DURATION_MINUTES * 60 * 1000
      );
      updateData.loginAttempts = 0; // Reset after lockout
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await createAuditLog({
      businessId: user.businessId,
      userId: user.id,
      action: AuditActions.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: {
        reason: 'Invalid password',
        attemptNumber: loginAttempts,
        locked: shouldLock,
      },
    });

    if (shouldLock) {
      await createAuditLog({
        businessId: user.businessId,
        userId: user.id,
        action: AuditActions.USER_ACCOUNT_LOCKED,
        entityType: 'user',
        entityId: user.id,
        ipAddress,
        userAgent,
      });

      throw new AuthError(
        `Account locked for ${config.LOCKOUT_DURATION_MINUTES} minutes due to too many failed attempts`,
        'ACCOUNT_LOCKED'
      );
    }

    const remaining = config.MAX_LOGIN_ATTEMPTS - loginAttempts;
    throw new AuthError(
      `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      'INVALID_CREDENTIALS'
    );
  }

  // Successful login - reset attempts and update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  // Get permissions
  const permissions = user.role?.permissions.map(rp => rp.permission.name) || [];

  // Generate tokens
  const accessTokenPayload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    sub: user.id,
    businessId: user.businessId,
    branchId: user.branchId,
    roleId: user.roleId,
    permissions,
  };

  const accessToken = generateAccessToken(accessTokenPayload);

  // Create session and refresh token
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      businessId: user.businessId,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      refreshToken: '', // Will update after generating
    },
  });

  const refreshToken = generateRefreshToken({
    sub: user.id,
    sessionId: session.id,
  });

  // Update session with hashed refresh token
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshToken: await hashPassword(refreshToken) },
  });

  // Audit log
  await createAuditLog({
    businessId: user.businessId,
    userId: user.id,
    action: AuditActions.USER_LOGIN,
    entityType: 'user',
    entityId: user.id,
    ipAddress,
    userAgent,
  });

  logger.info('User logged in', {
    userId: user.id,
    username: user.username,
    businessId: user.businessId,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      roleName: user.role?.name || null,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
      businessId: user.businessId,
      businessName: user.business.name,
      permissions,
    },
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(
  token: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // Verify refresh token
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AuthError('Invalid refresh token', 'INVALID_TOKEN');
  }

  // Find session
  const session = await prisma.session.findUnique({
    where: { id: payload.sessionId },
    include: {
      user: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!session || session.userId !== payload.sub) {
    throw new AuthError('Invalid session', 'INVALID_SESSION');
  }

  // Verify stored refresh token matches
  const tokenMatches = await verifyPassword(token, session.refreshToken);
  if (!tokenMatches) {
    // Possible token reuse - invalidate all sessions for this user
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    throw new AuthError('Token reuse detected. All sessions invalidated.', 'TOKEN_REUSE');
  }

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    throw new AuthError('Session expired', 'SESSION_EXPIRED');
  }

  // Check if user is still active
  if (!session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } });
    throw new AuthError('Account has been disabled', 'ACCOUNT_DISABLED');
  }

  // Generate new tokens (rotation)
  const permissions = session.user.role?.permissions.map(rp => rp.permission.name) || [];

  const newAccessToken = generateAccessToken({
    sub: session.user.id,
    businessId: session.user.businessId,
    branchId: session.user.branchId,
    roleId: session.user.roleId,
    permissions,
  });

  const newRefreshToken = generateRefreshToken({
    sub: session.user.id,
    sessionId: session.id,
  });

  // Update session with new refresh token
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: await hashPassword(newRefreshToken),
      ipAddress,
      userAgent,
    },
  });

  // Audit log
  await createAuditLog({
    businessId: session.user.businessId,
    userId: session.user.id,
    action: AuditActions.TOKEN_REFRESHED,
    entityType: 'session',
    entityId: session.id,
    ipAddress,
    userAgent,
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Logout and invalidate session
 */
export async function logout(refreshToken: string, userId: string, businessId: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(refreshToken);
    
    await prisma.session.deleteMany({
      where: {
        id: payload.sessionId,
        userId,
      },
    });

    await createAuditLog({
      businessId,
      userId,
      action: AuditActions.USER_LOGOUT,
      entityType: 'session',
      entityId: payload.sessionId,
    });
  } catch {
    // Token invalid, but we still want to try cleaning up
    logger.warn('Logout with invalid token', { userId });
  }
}

/**
 * Logout all sessions for a user
 */
export async function logoutAll(userId: string, businessId: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { userId },
  });

  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.USER_LOGOUT,
    entityType: 'user',
    entityId: userId,
    metadata: { allSessions: true },
  });
}

/**
 * Change user's password
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  businessId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AuthError('User not found', 'USER_NOT_FOUND');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD');
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  // Invalidate all sessions (force re-login)
  await prisma.session.deleteMany({ where: { userId } });

  // Audit log
  await createAuditLog({
    businessId,
    userId,
    action: AuditActions.PASSWORD_CHANGED,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
  });

  logger.info('Password changed', { userId, businessId });
}

/**
 * Reset user's password (admin operation)
 */
export async function resetPassword(
  userId: string,
  newPassword: string,
  adminId: string,
  businessId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AuthError('User not found', 'USER_NOT_FOUND');
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: newHash,
      loginAttempts: 0,
      lockedUntil: null,
    },
  });

  // Invalidate all sessions
  await prisma.session.deleteMany({ where: { userId } });

  // Audit log
  await createAuditLog({
    businessId,
    userId: adminId,
    action: AuditActions.PASSWORD_RESET,
    entityType: 'user',
    entityId: userId,
    ipAddress,
    userAgent,
    metadata: { targetUserId: userId },
  });

  logger.info('Password reset by admin', {
    adminId,
    targetUserId: userId,
    businessId,
  });
}

/**
 * Get current user with full details
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          currency: true,
          timezone: true,
        },
      },
      branch: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      role: {
        include: {
          permissions: {
            include: {
              permission: {
                select: {
                  id: true,
                  name: true,
                  module: true,
                  action: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const permissions = user.role?.permissions.map(rp => ({
    id: rp.permission.id,
    name: rp.permission.name,
    module: rp.permission.module,
    action: rp.permission.action,
  })) || [];

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    business: user.business,
    branch: user.branch,
    role: user.role ? {
      id: user.role.id,
      name: user.role.name,
      description: user.role.description,
    } : null,
    permissions,
  };
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  if (result.count > 0) {
    logger.info('Cleaned up expired sessions', { count: result.count });
  }

  return result.count;
}

/**
 * Custom error class for authentication errors
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
