import { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

/**
 * Authorization middleware factory
 * Checks if the user has the required permission
 */
export function authorize(requiredPermission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const userPermissions = req.user.permissions || [];

      // Check if user has the required permission or wildcard (*)
      const hasPermission = userPermissions.includes('*') || 
                           userPermissions.includes(requiredPermission);

      if (!hasPermission) {
        logger.warn('Permission denied', {
          userId: req.user.sub,
          requiredPermission,
          userPermissions,
          path: req.path,
          method: req.method,
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to perform this action',
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization middleware error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authorization error',
        },
      });
    }
  };
}

/**
 * Check if user has any of the required permissions
 */
export function authorizeAny(requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const userPermissions = req.user.permissions || [];

      const hasAnyPermission = userPermissions.includes('*') || 
                               requiredPermissions.some(p => userPermissions.includes(p));

      if (!hasAnyPermission) {
        logger.warn('Permission denied (authorizeAny)', {
          userId: req.user.sub,
          requiredPermissions,
          userPermissions,
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to perform this action',
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization middleware error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authorization error',
        },
      });
    }
  };
}

/**
 * Check if user has all of the required permissions
 */
export function authorizeAll(requiredPermissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const userPermissions = req.user.permissions || [];

      const hasAllPermissions = userPermissions.includes('*') || 
                                requiredPermissions.every(p => userPermissions.includes(p));

      if (!hasAllPermissions) {
        logger.warn('Permission denied (authorizeAll)', {
          userId: req.user.sub,
          requiredPermissions,
          userPermissions,
        });

        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to perform this action',
          },
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Authorization middleware error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authorization error',
        },
      });
    }
  };
}
