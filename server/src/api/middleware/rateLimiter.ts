import rateLimit from 'express-rate-limit';
import { config } from '../../lib/config.js';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed requests
});

// Sensitive operations rate limiter
export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 attempts
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many sensitive operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// File upload rate limiter
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 uploads per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many file uploads. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Export rate limiter
export const exportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 exports per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many export requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Import rate limiter
export const importLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 imports per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many import requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Backup rate limiter
export const backupLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 backups per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many backup operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// WhatsApp rate limiter
export const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 WhatsApp operations per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many WhatsApp operations. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
