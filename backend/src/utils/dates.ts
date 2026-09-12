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

/** "2026-09-12" — sana o‘quv markaz vaqt mintaqasida */
export function businessDateString(value: Date): string {
  return new Date(value.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Oy boshlanishi (o‘quv markaz vaqti bo‘yicha); `monthsAgo` — necha oy orqaga */
export function startOfBusinessMonth(now: Date = new Date(), monthsAgo = 0): Date {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  const monthStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - monthsAgo, 1, 0, 0, 0, 0);
  return new Date(monthStart - OFFSET_MS);
}

/** Tanlangan oy chegaralari (o‘quv markaz vaqti bo‘yicha): [boshlanish, keyingi oy boshlanishi) */
export function businessMonthRange(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - OFFSET_MS),
  };
}

/** Joriy oy (o‘quv markaz vaqti bo‘yicha) */
export function currentBusinessMonth(now: Date = new Date()): { year: number; month: number } {
  const value = businessDateString(now);
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}
