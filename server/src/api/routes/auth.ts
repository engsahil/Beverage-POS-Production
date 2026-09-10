import { Router, Request, Response } from 'express';
import { login, refreshToken, logout, changePassword, getCurrentUser, AuthError } from '../../services/authService.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, sensitiveLimiter } from '../middleware/rateLimiter.js';
import { loginSchema, refreshTokenSchema, changePasswordSchema } from '../validators/schemas.js';

const router = Router();

/**
 * POST /auth/login
 * Authenticate user and return tokens
 */
router.post('/login', authLimiter, validate(loginSchema), async (req: Request, res: Response) => {
  try {
    const { username, password, businessId } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await login({
      username,
      password,
      businessId,
      ipAddress,
      userAgent,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'LOGIN_ERROR',
        message: 'An error occurred during login',
      },
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', sensitiveLimiter, validate(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const result = await refreshToken(token, ipAddress, userAgent);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_ERROR',
        message: 'An error occurred during token refresh',
      },
    });
  }
});

/**
 * POST /auth/logout
 * Logout and invalidate session
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No token provided' },
      });
      return;
    }

    // For logout, we need the refresh token from the request body
    const { refreshToken: token } = req.body;

    if (token && req.user) {
      await logout(token, req.user.sub, req.user.businessId);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_ERROR',
        message: 'An error occurred during logout',
      },
    });
  }
});

/**
 * POST /auth/change-password
 * Change current user's password
 */
router.post(
  '/change-password',
  authenticate,
  sensitiveLimiter,
  validate(changePasswordSchema),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.get('user-agent');

      await changePassword(
        req.user.sub,
        currentPassword,
        newPassword,
        req.user.businessId,
        ipAddress,
        userAgent
      );

      res.status(200).json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_ERROR',
          message: 'An error occurred while changing password',
        },
      });
    }
  }
);

/**
 * GET /auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    const user = await getCurrentUser(req.user.sub);

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found or inactive' },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'USER_FETCH_ERROR',
        message: 'An error occurred while fetching user data',
      },
    });
  }
});

export default router;
