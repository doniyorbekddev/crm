import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { env, isProduction } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { slowRequestLogger } from './middleware/slowRequest.js';
import { apiRouter } from './routes/index.js';

/**
 * Express ilovasini yaratadi. `listen` bu yerda chaqirilmaydi —
 * shu sababli testlarda (Supertest) ilovani port ochmasdan ishlatish mumkin.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(
    helmet({
      // API JSON qaytaradi — brauzerda hech narsa render qilinmaydi
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
      // HSTS faqat productionda (HTTPS ortida) kerak
      hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true, preload: false } : false,
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    }),
  );
  // Fayl yuklash alohida endpoint orqali bo‘ladi — JSON tanasi kichik bo‘lishi kerak
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 50 }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(slowRequestLogger);

  app.use('/api', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
