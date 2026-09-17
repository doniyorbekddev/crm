
import { moneyUz } from '../utils/money.js';/** Maosh davrlari uchun o‘zbekcha oy nomlari */
export const MONTH_NAMES: readonly string[] = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** (2026, 9) → "2026-yil sentabr" */
export function formatSalaryPeriod(year: number, month: number): string {
  return `${year}-yil ${MONTH_NAMES[month - 1] ?? month}`;
}

/** Maoshni so‘mda ko‘rsatish (bildirishnoma matnlari uchun) */
export function formatSalaryAmount(amount: number): string {
  return `${moneyUz(amount)}`;
}
