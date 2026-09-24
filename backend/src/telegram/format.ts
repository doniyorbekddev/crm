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

/** O'quv markaz mintaqasidagi sana-vaqt → UTC `Date` (masalan, vazifa muddati uchun) */
export function localToUtc(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);
}

/**
 * Foydalanuvchi yozgan sanani o'qiydi: `25.12.2026`, `25.12.2026 18:00`, `25.12` (joriy yil).
 * Vaqt berilmasa — kun oxiri (23:59), chunki muddat odatda "shu kungacha" degani.
 */
export function parseLocalDateTime(text: string, now: Date = new Date()): Date | null {
  const match = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : shifted(now).getUTCFullYear();
  const hour = match[4] ? Number(match[4]) : 23;
  const minute = match[5] ? Number(match[5]) : 59;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const result = localToUtc(year, month, day, hour, minute);
  // 31.02 kabi sanalar oyni "ag'darib" yuboradi — bunday kiritish rad etiladi
  const check = new Date(result.getTime() + OFFSET_MS);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return result;
}

export function monthTitle(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export { moneyUz };
