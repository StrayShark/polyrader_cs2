import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

// ============================================================
// Request ID — attaches X-Request-ID to every request
// ============================================================
export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.headers['x-request-id'] = (req.headers['x-request-id'] as string) ?? randomUUID();
  next();
}

// ============================================================
// Structured request logger
// ============================================================
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const requestId = req.headers['x-request-id'];
    const method = req.method;
    const path = req.path;
    const status = res.statusCode;
    const userAgent = req.headers['user-agent']?.slice(0, 80);

    if (status >= 500) {
      logger.error('Request completed', { requestId, method, path, status, duration: `${duration}ms`, userAgent });
    } else if (status >= 400) {
      logger.warn('Request completed', { requestId, method, path, status, duration: `${duration}ms`, userAgent });
    } else {
      logger.info('Request completed', { requestId, method, path, status, duration: `${duration}ms`, userAgent });
    }
  });

  next();
}

// ============================================================
// Global error handler
// ============================================================
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string;

  logger.error('Unhandled error', {
    requestId,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(500).json({
    error: 'Internal server error',
    requestId,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

// ============================================================
// 404 handler — must be registered after all routes
// ============================================================
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method,
  });
}

// ============================================================
// Request body size limit
// ============================================================
export const BODY_LIMIT = '1mb';
