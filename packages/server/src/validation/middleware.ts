import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Express middleware factory for Zod validation.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = schema.parse(req[target]);
      req[target] = data;
      next();
    } catch (err: unknown) {
      const zodErr = err as ZodError;
      const issues = zodErr?.issues ?? [];
      res.status(400).json({
        error: 'Validation error',
        details: issues.map((e) => ({
          path: e.path?.join('.') ?? '',
          message: e.message ?? 'Invalid value',
        })),
      });
    }
  };
}
