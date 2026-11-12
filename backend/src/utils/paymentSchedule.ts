import { distributePaid } from './billingLedger.js';

/**
 * To‘lov jadvali hisob-kitobi (sof funksiyalar).
 *
 * Qism holati bazada saqlanmaydi: avval oyga aniq biriktirilgan to'lovlar (`payment_allocations`), keyin qolgan
 * to'langan summa (`Debt.paidAmount`, qaytarishlar ayirilgan) qismlarga muddat tartibida taqsimlanadi
 * (`billingLedger.distributePaid`). Shunda to‘lov bekor qilinsa yoki qaytarilsa jadval o‘zi to‘g‘ri holatga keladi.
 */

export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'DUE_TODAY' | 'UPCOMING' | 'OVERDUE' | 'CANCELLED';

export const MAX_INSTALLMENTS = 36;

const DAY_MS = 86_400_000;

export interface PlannedInstallment {
  sequence: number;
  dueDate: string;
  amount: number;
}

export interface ScheduleRow extends PlannedInstallment {
  id: string;
  note: string | null;
  /** Bekor qilingan oy majburiyati — hisobga kirmaydi */
  cancelled?: boolean;
}

export interface AllocatedInstallment extends ScheduleRow {
  paid: number;
  remaining: number;
  status: InstallmentStatus;
  /** Muddati o‘tgan bo‘lsa — necha kun */
  overdueDays: number;
}

export interface ScheduleTotals {
  scheduledTotal: number;
  /** Bugungacha (bugun ham) to‘lanishi kerak bo‘lgan jami */
  dueToDate: number;
  overdueAmount: number;
  /** Eng eski to‘lanmagan qismning kechikishi */
  overdueDays: number;
  nextDue: { dueDate: string; amount: number } | null;
}

function dateParts(date: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return [year, month, day];
}

/** "2026-01-31" + 1 oy → "2026-02-28": oyda bunday kun bo‘lmasa oyning oxirgi kuni olinadi */
export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = dateParts(date);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);
}

/** "2026-02-30" kabi mavjud bo‘lmagan sanani rad etadi */
export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Shartnoma summasini oylik teng qismlarga bo‘ladi. Qismlar 1 000 so‘mga yuvarlanadi, yuvarlashdan
 * qolgan farq oxirgi qismga qo‘shiladi — jami har doim shartnomaga teng. Hech bir qism nol bo‘lmaydi.
 */
export function buildMonthlyPlan(total: number, count: number, firstDueDate: string): PlannedInstallment[] {
  if (total <= 0) return [];
  const requested = Math.min(Math.max(Math.trunc(count), 1), MAX_INSTALLMENTS);
  const safeCount = Math.min(requested, Math.max(Math.floor(total), 1));
  const rounded = Math.floor(total / safeCount / 1000) * 1000;
  const base = rounded > 0 ? rounded : Math.floor(total / safeCount);
  return Array.from({ length: safeCount }, (_, index) => ({
    sequence: index + 1,
    dueDate: addMonthsClamped(firstDueDate, index),
    amount: index === safeCount - 1 ? total - base * (safeCount - 1) : base,
  }));
}

/**
 * To'lov hisobi shu oydan boshlanadi: undan oldingi oylar jadvalga qo'shilmaydi (CRM 2026-yil oktyabrdan yuritiladi,
 * oldingi oylar tizimdan tashqarida hal qilingan).
 */
export const BILLING_START_MONTH = '2026-10';

/**
 * Oylik to'lov jadvali: har oyga **to'liq oylik to'lov** (bo'linmaydi, kunlik hisob yo'q). `count` oy — `firstDueDate`
 * dan boshlab; {@link BILLING_START_MONTH} dan oldingi oylar tashlanadi (jadval qisqaradi, siljimaydi).
 */
export function buildFixedMonthlyPlan(monthly: number, count: number, firstDueDate: string, startMonth: string = BILLING_START_MONTH): PlannedInstallment[] {
  if (monthly <= 0) return [];
  const safeCount = Math.min(Math.max(Math.trunc(count), 1), MAX_INSTALLMENTS);
  return Array.from({ length: safeCount }, (_, index) => addMonthsClamped(firstDueDate, index))
    .filter((dueDate) => dueDate.slice(0, 7) >= startMonth)
    .map((dueDate, index) => ({ sequence: index + 1, dueDate, amount: monthly }));
}

/**
 * To‘langan summani qismlarga taqsimlaydi va har bir qism holatini aniqlaydi. `explicitByMonth` — oyga aniq
 * biriktirilgan sof summa ("2026-10" → so'm); bo'lmasa hammasi muddat tartibida.
 */
export function allocateSchedule(
  rows: ScheduleRow[],
  paidAmount: number,
  today: string,
  explicitByMonth: ReadonlyMap<string, number> = new Map(),
): { installments: AllocatedInstallment[]; totals: ScheduleTotals } {
  const ordered = [...rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
  const distributed = new Map(
    distributePaid(
      ordered.map((row) => ({ ...row, cancelled: row.cancelled ?? false })),
      Math.max(paidAmount, 0),
      explicitByMonth,
    ).rows.map((item) => [item.row.id, item]),
  );

  const all = ordered.map((row): AllocatedInstallment => {
    const item = distributed.get(row.id);
    if (!item) return { ...row, paid: 0, remaining: 0, status: 'CANCELLED', overdueDays: 0 };
    const { paid, remaining } = item;
    if (remaining === 0) return { ...row, paid, remaining, status: 'PAID', overdueDays: 0 };
    if (row.dueDate < today) return { ...row, paid, remaining, status: 'OVERDUE', overdueDays: daysBetween(row.dueDate, today) };
    if (row.dueDate === today) return { ...row, paid, remaining, status: 'DUE_TODAY', overdueDays: 0 };
    return { ...row, paid, remaining, status: paid > 0 ? 'PARTIAL' : 'UPCOMING', overdueDays: 0 };
  });

  const installments = all.filter((item) => item.status !== 'CANCELLED');
  const next = installments.find((item) => item.remaining > 0 && item.status !== 'OVERDUE');
  const sum = (items: AllocatedInstallment[], pick: (item: AllocatedInstallment) => number) =>
    items.reduce((total, item) => total + pick(item), 0);
  const overdue = installments.filter((item) => item.status === 'OVERDUE');

  return {
    installments: all,
    totals: {
      scheduledTotal: sum(installments, (item) => item.amount),
      dueToDate: sum(
        installments.filter((item) => item.dueDate <= today),
        (item) => item.amount,
      ),
      overdueAmount: sum(overdue, (item) => item.remaining),
      overdueDays: overdue.reduce((max, item) => Math.max(max, item.overdueDays), 0),
      nextDue: next ? { dueDate: next.dueDate, amount: next.remaining } : null,
    },
  };
}
