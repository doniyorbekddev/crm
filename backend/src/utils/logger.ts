import { pino } from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';
import { env } from '../config/env.js';

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: 'crm-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
};

/**
 * Development: rangli, o‘qish oson loglar. pino-pretty shu jarayonning o‘zida sinxron ishlaydi
 * (transport worker thread ishlatilmaydi) — dev muhitida soddaroq va ishonchliroq.
 * Production: JSON loglar stdout’ga; pino-pretty devDependency bo‘lgani uchun u yerda yuklanmaydi.
 */
async function createDevelopmentDestination(): Promise<DestinationStream | undefined> {
  if (env.NODE_ENV !== 'development') return undefined;
  const { default: pretty } = await import('pino-pretty');
  return pretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss',
    ignore: 'pid,hostname,service',
    sync: true,
  });
}

const destination = await createDevelopmentDestination();

export const logger = destination ? pino(options, destination) : pino(options);
