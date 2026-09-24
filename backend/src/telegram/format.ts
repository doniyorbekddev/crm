import { env } from '../config/env.js';
import { moneyUz } from '../utils/money.js';

/**
 * Bot xabarlari uchun formatlash yordamchilari.
 *
 * Sana va vaqt **o'quv markaz mintaqasida** ko'rsatiladi (`APP_UTC_OFFSET_MINUTES`), UTC da
 * emas: ota-ona "dars 09:00 da" deb ko'rsa, u o'z soatidagi 09:00 bo'lishi kerak.
 */

const OFFSET_MS = env.APP_UTC_OFFSET_MINUTES * 60_000;

function shifted(value: Date | string): Date {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(date.getTime() + OFFSET_MS);
}

/** 24.09.2026 */
export function fmtDate(value: Date | string): string {
  const d = shifted(value);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

/** 24.09.2026 18:30 */
export function fmtDateTime(value: Date | string): string {
  const d = shifted(value);
  return `${fmtDate(value)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "2026-09" ko'rinishidagi oy kaliti (o'quv markaz mintaqasida) */
export function monthKeyOf(value: Date): string {
  return shifted(value).toISOString().slice(0, 7);
}

export const MONTH_NAMES = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
] as const;

export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export { moneyUz };
