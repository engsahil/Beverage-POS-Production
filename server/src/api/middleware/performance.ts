/**
 * Phase 24: Performance Monitoring Middleware
 * Tracks request timing and adds performance headers safely.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

/**
 * Request timing middleware
 *
 * Measures request duration, adds a request ID, and logs slow requests.
 *
 * IMPORTANT:
 * Headers must be set BEFORE the response is sent.
 * The 'finish' event happens after the response has already been sent,
 * so we only perform logging inside that event.
 */
export function requestTimer(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = process.hrtime.bigint();

  const requestId =
    Math.random().toString(36).substring(2) +
    Date.now().toString(36);

  // Safe: header is set before the response is sent
  res.setHeader('X-Request-ID', requestId);

  /**
   * Override res.writeHead so the response-time header is added
   * immediately before headers are sent to the client.
   */
  const originalWriteHead = res.writeHead.bind(res);

  res.writeHead = function (
    statusCode: number,
    statusMessage?: string | Record<string, string | number | string[]>,
    headers?: Record<string, string | number | string[]>
  ): Response {
    try {
      if (!res.headersSent) {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;

        res.setHeader(
          'X-Response-Time',
          `${durationMs.toFixed(2)}ms`
        );
      }
    } catch (error) {
      // Never allow performance monitoring to crash the API
      logger.warn('Failed to set response timing header', {
        requestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }

    return originalWriteHead(
      statusCode,
      statusMessage as any,
      headers as any
    );
  } as typeof res.writeHead;

  /**
   * Response finish event.
   *
   * DO NOT set headers here.
   * At this point the response has already been sent.
   */
  res.on('finish', () => {
    try {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      // Log slow requests
      if (durationMs > 1000) {
        logger.warn('Slow request detected', {
          requestId,
          method: req.method,
          path: req.originalUrl || req.path,
          status: res.statusCode,
          duration: `${durationMs.toFixed(2)}ms`,
          userAgent: req.get('user-agent') || 'unknown',
        });
      }
    } catch (error) {
      // Never allow logging errors to crash the API
      logger.warn('Performance monitoring error', {
        requestId,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  });

  next();
}

/**
 * Cache control middleware
 *
 * Adds appropriate cache headers depending on whether
 * the route is authenticated or public.
 */
export function cacheControl(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Authenticated requests should never be cached
  if (req.headers.authorization) {
    res.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );

    res.setHeader('Pragma', 'no-cache');

    res.setHeader('Expires', '0');

    res.setHeader('Surrogate-Control', 'no-store');
  } else {
    // Health and public endpoints can be cached briefly
    if (
      req.path === '/health' ||
      req.path === '/api/v1/health' ||
      req.path.startsWith('/api/v1/public')
    ) {
      res.setHeader(
        'Cache-Control',
        'public, max-age=60'
      );
    } else {
      // Default safe behavior for API routes
      res.setHeader('Cache-Control', 'no-cache');
    }
  }

  next();
}

/**
 * Security headers middleware
 *
 * Adds standard security-related HTTP headers.
 */
export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Prevent MIME type sniffing
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  // Prevent clickjacking
  res.setHeader(
    'X-Frame-Options',
    'DENY'
  );

  // XSS protection for legacy browsers
  res.setHeader(
    'X-XSS-Protection',
    '1; mode=block'
  );

  // Referrer policy
  res.setHeader(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  // Disable unnecessary browser features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  // Remove Express technology disclosure
  res.removeHeader('X-Powered-By');

  next();
}

/**
 * Request size limiter
 *
 * Prevents clients from sending excessively large request bodies.
 *
 * Default limit: 10 MB
 */
export function requestSizeLimiter(
  maxSizeBytes: number = 10 * 1024 * 1024
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const contentLengthHeader =
      req.headers['content-length'];

    const contentLength = parseInt(
      typeof contentLengthHeader === 'string'
        ? contentLengthHeader
        : '0',
      10
    );

    // Invalid or missing content-length should not block request
    if (
      !Number.isNaN(contentLength) &&
      contentLength > maxSizeBytes
    ) {
      res.status(413).json({
        success: false,
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: `Request body too large. Maximum size: ${
            maxSizeBytes / 1024 / 1024
          }MB`,
        },
      });

      return;
    }

    next();
  };
}