import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Hisobot davri (tarixiy ma'lumot, 3-bosqich): oy URL da `?period=2026-10` ko'rinishida — havola ulashilsa ham,
 * sahifa yangilansa ham tanlangan oy saqlanadi. Parametr yo'q, noto'g'ri yoki kelajak oy bo'lsa — joriy oy
 * (o'quv markaz vaqti, Toshkent bo'yicha). Yangi oy boshlanganda standart avtomatik yangi oyga o'tadi.
 */

export interface ReportingPeriod {
  year: number;
  month: number;
}

export const PERIOD_PARAM = 'period';

const BUSINESS_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit' });

/** Joriy oy o'quv markaz vaqti bo'yicha (brauzer vaqt zonasi emas) */
export function currentReportingPeriod(now: Date = new Date()): ReportingPeriod {
  const parts = BUSINESS_MONTH.formatToParts(now);
  return { year: Number(parts.find((part) => part.type === 'year')?.value), month: Number(parts.find((part) => part.type === 'month')?.value) };
}

export function periodKey(period: ReportingPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`;
}

export function shiftPeriod(period: ReportingPeriod, months: number): ReportingPeriod {
  const index = period.year * 12 + (period.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const index = (period: ReportingPeriod) => period.year * 12 + period.month;

/** Oyning birinchi va oxirgi kuni ("2026-10-01" … "2026-10-31") — sana oralig'i bilan ishlaydigan sahifalar uchun */
export function periodDateRange(period: ReportingPeriod): { from: string; to: string } {
  const last = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const prefix = periodKey(period);
  return { from: `${prefix}-01`, to: `${prefix}-${String(last).padStart(2, '0')}` };
}

/** `2026-10` → davr; noto'g'ri yoki kelajak oy — `null` */
export function parsePeriod(value: string | null, now: Date = new Date()): ReportingPeriod | null {
  const match = value ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value) : null;
  if (!match) return null;
  const period = { year: Number(match[1]), month: Number(match[2]) };
  if (period.year < 2020 || index(period) > index(currentReportingPeriod(now))) return null;
  return period;
}

export function useReportingPeriod() {
  const [params, setParams] = useSearchParams();
  const current = currentReportingPeriod();
  const period = parsePeriod(params.get(PERIOD_PARAM)) ?? current;
  const isCurrent = index(period) === index(current);

  const setPeriod = useCallback(
    (next: ReportingPeriod) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (index(next) === index(currentReportingPeriod())) updated.delete(PERIOD_PARAM);
          else updated.set(PERIOD_PARAM, periodKey(next));
          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const resetToCurrent = useCallback(() => setPeriod(currentReportingPeriod()), [setPeriod]);

  return { period, current, isCurrent, setPeriod, resetToCurrent, explicit: params.has(PERIOD_PARAM) };
}
