import { describe, expect, it } from 'vitest';
import { currentReportingPeriod, parsePeriod, periodKey, shiftPeriod } from './useReportingPeriod';

describe('hisobot davri', () => {
  it('joriy oy Toshkent vaqti bo‘yicha — UTC da hali oktyabr, markazda noyabr', () => {
    // 2026-10-31 19:30 UTC = 2026-11-01 00:30 Toshkent
    expect(currentReportingPeriod(new Date('2026-10-31T19:30:00Z'))).toEqual({ year: 2026, month: 11 });
    expect(currentReportingPeriod(new Date('2026-10-31T18:59:00Z'))).toEqual({ year: 2026, month: 10 });
  });

  it('URL qiymati: to‘g‘ri o‘tgan oy qabul qilinadi, noto‘g‘ri va kelajak oy — yo‘q (standart joriy oy)', () => {
    const now = new Date('2026-11-15T08:00:00Z');
    expect(parsePeriod('2026-10', now)).toEqual({ year: 2026, month: 10 });
    expect(parsePeriod('2026-11', now)).toEqual({ year: 2026, month: 11 });
    expect(parsePeriod('2026-12', now)).toBeNull();
    expect(parsePeriod('2026-13', now)).toBeNull();
    expect(parsePeriod('oktyabr', now)).toBeNull();
    expect(parsePeriod(null, now)).toBeNull();
  });

  it('oy siljishi yil chegarasidan o‘tadi', () => {
    expect(shiftPeriod({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftPeriod({ year: 2025, month: 12 }, 1)).toEqual({ year: 2026, month: 1 });
    expect(periodKey({ year: 2026, month: 3 })).toBe('2026-03');
  });
});
