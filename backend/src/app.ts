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
import { timingSafeEqual } from 'node:crypto';
import { renderMetrics } from './utils/metrics.js';
// O'lchagichlarni ro'yxatdan o'tkazadi (navbat hajmi, ishlar, urinishlar)
import './services/observability.js';

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
  // Fayl yuklash alohida endpoint orqali bo‘ladi — JSON tanasi kichik bo‘lishi kerak.
  //
  // `verify` — to‘lov webhooklari uchun **xom tana** saqlanadi: imzo aynan yuborilgan baytlardan
  // hisoblanadi, JSON qayta serializatsiya qilinsa (probel, kalitlar tartibi) imzo mos kelmay qoladi.
  // Faqat webhook yo‘lida saqlanadi — qolgan so‘rovlarda ortiqcha xotira ishlatilmaydi.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        if (req.url?.startsWith('/api/payments/webhook/')) {
          (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
        }
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 50 }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(slowRequestLogger);

  // Prometheus metrikalari (TZ §68): faqat METRICS_TOKEN sozlanganda va Bearer token bilan
  app.get('/metrics', async (req, res) => {
    const expected = env.METRICS_TOKEN;
    const given = Buffer.from((req.header('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    // Bayt uzunligi solishtiriladi (timingSafeEqual turli uzunlikda throw qiladi — ASCII bo'lmagan belgi)
    if (!expected || given.length !== Buffer.byteLength(expected) || !timingSafeEqual(given, Buffer.from(expected))) {
      res.status(404).end();
      return;
    }
    res.type('text/plain; version=0.0.4').send(await renderMetrics());
  });

  app.use('/api', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
