import type { Request, Response } from 'express';
import { isDatabaseReachable } from '../config/database.js';
import { env } from '../config/env.js';
import { sendSuccess } from '../utils/apiResponse.js';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

/** Load balancer / monitoring uchun: baza ishlamasa 503 qaytaradi. */
export async function getHealth(_req: Request, res: Response): Promise<void> {
  const databaseUp = await isDatabaseReachable();

  const data: HealthStatus = {
    status: databaseUp ? 'ok' : 'degraded',
    service: 'crm-backend',
    environment: env.NODE_ENV,
    database: databaseUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  sendSuccess(res, data, {
    statusCode: databaseUp ? 200 : 503,
    message: databaseUp ? 'API ishlayapti' : 'API ishlayapti, lekin ma’lumotlar bazasiga ulanib bo‘lmadi',
  });
}
