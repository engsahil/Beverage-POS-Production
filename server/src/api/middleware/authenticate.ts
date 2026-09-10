import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../../utils/tokens.js';
import { logger } from '../../lib/logger.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      const payload = verifyAccessToken(token);
      req.user = payload;
      next();
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Session expired. Please log in again.',
          },
        });
        return;
      }

      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }
  } catch (error) {
    logger.error('Authentication middleware error', { error: String(error) });
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication error',
      },
    });
  }
}

// Optional authentication - doesn't fail if no token
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token);
      req.user = payload;
    } catch {
      // Token invalid, but that's OK for optional auth
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error: String(error) });
    next();
  }
}
