import { env } from '../config/env.js';

const DAY_MS = 86_400_000;
const OFFSET_MS = env.APP_UTC_OFFSET_MINUTES * 60_000;

/**
 * O‘quv markaz vaqt mintaqasidagi kun boshlanishi (UTC Date sifatida).
 * Server qaysi vaqt mintaqasida ishlashidan qat’i nazar "bugun" bir xil hisoblanadi.
 */
export function startOfBusinessDay(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - OFFSET_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
