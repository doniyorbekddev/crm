import { describe, expect, it } from 'vitest';
import {
  MAX_INSTALLMENTS,
  addMonthsClamped,
  allocateSchedule,
  buildMonthlyPlan,
  isValidDateOnly,
} from '../../src/utils/paymentSchedule.js';

const row = (sequence: number, dueDate: string, amount: number) => ({ id: `i${sequence}`, sequence, dueDate, amount, note: null });

describe('To‘lov jadvali: reja tuzish', () => {
  it('shartnomani oylik teng qismlarga bo‘ladi', () => {
    const plan = buildMonthlyPlan(7_200_000, 6, '2026-09-15');
    expect(plan.map((item) => item.amount)).toEqual(Array(6).fill(1_200_000));
    expect(plan.map((item) => item.dueDate)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15', '2027-02-15']);
    expect(plan.map((item) => item.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('1 000 so‘mga yuvarlaydi, farq oxirgi qismga tushadi; oy oxiri to‘g‘ri olinadi', () => {
    const plan = buildMonthlyPlan(1_000_000, 3, '2026-01-31');
    expect(plan.map((item) => item.amount)).toEqual([333_000, 333_000, 334_000]);
    expect(plan.map((item) => item.dueDate)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('nol va chegaraviy holatlar: bo‘sh shartnoma, juda kichik summa, qismlar soni chegarasi', () => {
    expect(buildMonthlyPlan(0, 6, '2026-09-01')).toEqual([]);
    const tiny = buildMonthlyPlan(5, 6, '2026-09-01');
    expect(tiny).toHaveLength(5);
    expect(tiny.every((item) => item.amount > 0)).toBe(true);
    expect(buildMonthlyPlan(100_000_000, 100, '2026-09-01')).toHaveLength(MAX_INSTALLMENTS);
    for (const [total, count] of [[1_234_567, 7], [999_999, 12], [50_000, 3]] as const) {
      expect(buildMonthlyPlan(total, count, '2026-09-01').reduce((sum, item) => sum + item.amount, 0)).toBe(total);
    }
  });

  it('mavjud bo‘lmagan sanani aniqlaydi', () => {
    expect(isValidDateOnly('2026-02-28')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('15.09.2026')).toBe(false);
  });
});

describe('To‘lov jadvali: to‘lovni qismlarga taqsimlash', () => {
  const rows = [row(1, '2026-07-10', 1_000_000), row(2, '2026-08-10', 1_000_000), row(3, '2026-09-10', 1_000_000)];

  it('to‘langan summa muddat tartibida taqsimlanadi: to‘langan, muddati o‘tgan, bugun', () => {
    const { installments, totals } = allocateSchedule(rows, 1_500_000, '2026-09-10');
    expect(installments.map((item) => [item.status, item.paid, item.remaining, item.overdueDays])).toEqual([
      ['PAID', 1_000_000, 0, 0],
      ['OVERDUE', 500_000, 500_000, 31],
      ['DUE_TODAY', 0, 1_000_000, 0],
    ]);
    expect(totals).toEqual({
      scheduledTotal: 3_000_000,
      dueToDate: 3_000_000,
      overdueAmount: 500_000,
      overdueDays: 31,
      nextDue: { dueDate: '2026-09-10', amount: 1_000_000 },
    });
  });

  it('kelajakdagi qism qisman to‘langan bo‘lishi mumkin; hammasi to‘langanda keyingi to‘lov yo‘q', () => {
    const early = allocateSchedule(rows, 1_200_000, '2026-07-01');
    expect(early.installments.map((item) => item.status)).toEqual(['PAID', 'PARTIAL', 'UPCOMING']);
    expect(early.totals.nextDue).toEqual({ dueDate: '2026-08-10', amount: 800_000 });
    expect(early.totals.overdueAmount).toBe(0);

    const done = allocateSchedule(rows, 3_500_000, '2026-12-01');
    expect(done.installments.every((item) => item.status === 'PAID')).toBe(true);
    expect(done.totals.nextDue).toBeNull();
  });

  it('eng eski kechikish kunlari olinadi va tartib muddat bo‘yicha', () => {
    const shuffled = [rows[2]!, rows[0]!, rows[1]!];
    const { installments, totals } = allocateSchedule(shuffled, 0, '2026-09-20');
    expect(installments.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(totals.overdueDays).toBe(72);
    expect(totals.overdueAmount).toBe(3_000_000);
  });
});
