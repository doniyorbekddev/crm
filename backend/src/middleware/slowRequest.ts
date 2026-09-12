import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Sekin so‘rovlarni alohida belgilaydi. Bu unumdorlik muammolarini (og‘ir so‘rov,
 * yetishmayotgan indeks) loglardan darhol topish imkonini beradi.
 */
export function slowRequestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    if (durationMs < env.SLOW_REQUEST_MS) return;
    logger.warn(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs),
      },
      'Sekin so‘rov',
    );
  });

  next();
}
