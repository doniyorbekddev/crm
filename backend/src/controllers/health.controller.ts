import type { Request, Response } from 'express';
import { isDatabaseReachable } from '../config/database.js';
import { env } from '../config/env.js';
import { jobHealth } from '../services/observability.js';
import { sendSuccess } from '../utils/apiResponse.js';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  database: 'up' | 'down';
  /** Serverda ishlayotgan kod commiti (deploy.sh build paytida beradi; lokalda — `dev`) */
  version: string;
  /** Image yig'ilgan vaqt (UTC, ISO) — noma'lum bo'lsa null */
  builtAt: string | null;
  uptimeSeconds: number;
  timestamp: string;
}

// Build paytida Dockerfile ENV orqali beriladi — jarayon davomida o'zgarmaydi
const APP_VERSION = process.env.APP_VERSION?.trim() || 'dev';
const APP_BUILT_AT = process.env.APP_BUILT_AT?.trim() || null;

/** Load balancer / monitoring uchun: baza ishlamasa 503 qaytaradi. */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const databaseUp = await isDatabaseReachable();

  const data: HealthStatus = {
    status: databaseUp ? 'ok' : 'degraded',
    service: 'crm-backend',
    environment: env.NODE_ENV,
    database: databaseUp ? 'up' : 'down',
    version: APP_VERSION,
    builtAt: APP_BUILT_AT,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  sendSuccess(res, data, {
    statusCode: databaseUp ? 200 : 503,
    message: databaseUp ? 'API ishlayapti' : 'API ishlayapti, lekin ma’lumotlar bazasiga ulanib bo‘lmadi',
  });
}

/** Fon vazifalari: oxirgi muvaffaqiyatli va xato yurish (jarayon ishga tushgandan beri) */
export async function getJobHealth(_req: Request, res: Response): Promise<void> {
  sendSuccess(res, jobHealth());
}
