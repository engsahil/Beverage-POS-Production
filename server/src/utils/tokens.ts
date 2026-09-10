import jwt from 'jsonwebtoken';
import { config } from '../lib/config.js';

export interface AccessTokenPayload {
  sub: string; // user ID
  businessId: string;
  branchId?: string | null;
  roleId?: string | null;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // user ID
  sessionId: string;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): string {
  const expiresIn = parseDuration(config.JWT_ACCESS_EXPIRY);
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn,
    issuer: 'beverage-pos-system',
  });
}

export function generateRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp'>): string {
  const expiresIn = parseDuration(config.JWT_REFRESH_EXPIRY);
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn,
    issuer: 'beverage-pos-system',
  });
}

/**
 * Parse duration string like '15m', '7d' to seconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    issuer: 'beverage-pos-system',
  }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, {
    issuer: 'beverage-pos-system',
  }) as RefreshTokenPayload;
}

export function decodeToken(token: string): jwt.JwtPayload | null {
  try {
    return jwt.decode(token) as jwt.JwtPayload;
  } catch {
    return null;
  }
}
