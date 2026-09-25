import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Xatolarni kuzatish (TZ 3.0 §68 "Error tracking") — Sentry'ga to'g'ridan-to'g'ri HTTP orqali
 * (SDK'siz; `SENTRY_DSN` bo'lmasa hech narsa yuborilmaydi).
 *
 * Maxfiylik (§59 ruhida): so'rov tanasi, sarlavhalar, cookie yuborilmaydi; xabardagi email, telefon,
 * JWT/Bearer tokenlar yashiriladi. Marshrut — faqat shablon (`/students/:id`).
 */

interface Dsn {
  key: string;
  host: string;
  projectId: string;
  protocol: string;
}

function parseDsn(value: string | undefined): Dsn | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const projectId = url.pathname.replace(/^\/+/, '');
    if (!url.username || !projectId) return null;
    return { key: url.username, host: url.host, projectId, protocol: url.protocol.replace(':', '') };
  } catch {
    return null;
  }
}

const dsn = parseDsn(env.SENTRY_DSN);

/** Shaxsiy ma'lumot va sirlarni matndan olib tashlaydi */
export function scrub(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [yashirilgan]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[token]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?998[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, '[telefon]')
    .replace(/(password|parol|secret|token)=([^&\s]+)/gi, '$1=[yashirilgan]');
}

export function isErrorTrackingEnabled(): boolean {
  return dsn !== null;
}

/** Sentry `store` hodisasi (tashqi so'rov kutilmaydi — asosiy javobni sekinlashtirmaydi) */
export function buildEvent(error: unknown, context: { route?: string; method?: string; userId?: string | null; tags?: Record<string, string> } = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  const frames = (err.stack ?? '')
    .split('\n')
    .slice(1, 30)
    .map((line) => line.trim().replace(/^at\s+/, ''))
    .reverse()
    .map((line) => ({ function: scrub(line).slice(0, 200) }));
  return {
    event_id: randomUUID().replace(/-/g, ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    environment: env.NODE_ENV,
    server_name: 'crm-backend',
    exception: { values: [{ type: err.name, value: scrub(err.message).slice(0, 1000), stacktrace: { frames } }] },
    tags: { ...(context.route ? { route: context.route } : {}), ...(context.method ? { method: context.method } : {}), ...(context.tags ?? {}) },
    // Faqat ID — email/ism emas
    ...(context.userId ? { user: { id: context.userId } } : {}),
  };
}

export function captureException(error: unknown, context: Parameters<typeof buildEvent>[1] = {}): void {
  if (!dsn) return;
  const event = buildEvent(error, context);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  void fetch(`${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/store/`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'content-type': 'application/json',
      'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=crm-backend/1.0`,
    },
    body: JSON.stringify(event),
  })
    .catch((sendError: unknown) => logger.debug({ err: sendError }, 'Sentry’ga yuborib bo‘lmadi'))
    .finally(() => clearTimeout(timer));
}
