import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../../lib/logger.js';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = source === 'body' ? req.body : 
                   source === 'query' ? req.query : 
                   req.params;

      const validated = schema.parse(data);

      // Replace with validated and sanitized data
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        req.query = validated;
      } else {
        req.params = validated;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: formattedErrors,
          },
        });
        return;
      }

      logger.error('Validation middleware error', { error: String(error) });
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation error',
        },
      });
    }
  };
}
