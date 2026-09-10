import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger.js';
import { config } from '../../lib/config.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error
  logger.error('Unhandled error', {
    message: err.message,
    stack: config.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.user?.sub,
  });

  // App errors (expected)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = mapPrismaError(err);
    res.status(prismaError.statusCode).json({
      success: false,
      error: {
        code: prismaError.code,
        message: prismaError.message,
      },
    });
    return;
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid data provided',
      },
    });
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Session expired. Please log in again.',
      },
    });
    return;
  }

  // Default 500 error
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.NODE_ENV === 'development' 
        ? err.message 
        : 'An unexpected error occurred',
    },
  });
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  code: string;
  message: string;
} {
  switch (error.code) {
    case 'P2002':
      return {
        statusCode: 409,
        code: 'DUPLICATE_ENTRY',
        message: 'A record with this information already exists',
      };
    case 'P2025':
      return {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Record not found',
      };
    case 'P2003':
      return {
        statusCode: 400,
        code: 'FOREIGN_KEY_ERROR',
        message: 'Referenced record does not exist',
      };
    case 'P2014':
      return {
        statusCode: 400,
        code: 'RELATION_VIOLATION',
        message: 'Cannot perform this action due to related records',
      };
    default:
      return {
        statusCode: 500,
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
      };
  }
}

// Not found handler
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
