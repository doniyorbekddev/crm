import { describe, expect, it } from 'vitest';
import { planMonthlyFeeMigration } from '../../src/utils/monthlyFeeMigration.js';

const months = (keys: string[], amount: number) => keys.map((key, index) => ({ id: `i${index + 1}`, dueDate: `${key}-05`, amount, cancelled: false }));

describe('Oylik to‘lov modeliga o‘tkazish rejasi', () => {
  it('bo‘lingan jadval (600 000 / 12 = 50 000) har oyga to‘liq 600 000 bo‘ladi; 600 000 to‘lov oktyabrni yopadi', () => {
    const plan = planMonthlyFeeMigration({
      monthly: 600_000,
      installments: months(['2026-10', '2026-11', '2026-12'], 50_000),
      payments: [{ id: 'p1', paidAt: '2026-10-05T10:00:00.000Z', net: 600_000 }],
      closedMonths: new Set(),
      startMonth: '2026-10',
    });
    expect(plan.reprice.map((item) => [item.key, item.from, item.to])).toEqual([
      ['2026-10', 50_000, 600_000],
      ['2026-11', 50_000, 600_000],
      ['2026-12', 50_000, 600_000],
    ]);
    expect(plan).toMatchObject({ totalBefore: 150_000, totalAfter: 1_800_000, unallocated: 0, cancel: [], untouched: [] });
    // Oktyabr to'liq yopiladi, noyabr qarz bo'lib qoladi — kunma-kun emas
    expect(plan.allocations).toEqual([{ paymentId: 'p1', key: '2026-10', amount: 600_000 }]);
  });

  it('oktyabrdan oldingi oylar bekor qilinadi; to‘lovlar sana tartibida eng eski oydan; qaytarish ayrilgan', () => {
    const plan = planMonthlyFeeMigration({
      monthly: 345_000,
      installments: [...months(['2026-08', '2026-09', '2026-10', '2026-11'], 28_000), { id: 'old', dueDate: '2026-07-05', amount: 28_000, cancelled: true }],
      payments: [
        { id: 'late', paidAt: '2026-11-02T09:00:00.000Z', net: 345_000 },
        { id: 'early', paidAt: '2026-10-03T09:00:00.000Z', net: 300_000 },
      ],
      closedMonths: new Set(),
      startMonth: '2026-10',
    });
    expect(plan.cancel.map((item) => item.key)).toEqual(['2026-08', '2026-09']);
    expect(plan.charges).toEqual([
      { key: '2026-10', amount: 345_000 },
      { key: '2026-11', amount: 345_000 },
    ]);
    expect(plan.allocations).toEqual([
      { paymentId: 'early', key: '2026-10', amount: 300_000 },
      { paymentId: 'late', key: '2026-10', amount: 45_000 },
      { paymentId: 'late', key: '2026-11', amount: 300_000 },
    ]);
    expect(plan.totalAfter).toBe(690_000);
  });

  it('yopilgan oy va bir oyda bir nechta qism — tegilmaydi; jamidan ortiq to‘lov sig‘maydi', () => {
    const plan = planMonthlyFeeMigration({
      monthly: 500_000,
      installments: [
        { id: 'a', dueDate: '2026-10-05', amount: 40_000, cancelled: false },
        { id: 'b', dueDate: '2026-11-05', amount: 200_000, cancelled: false },
        { id: 'c', dueDate: '2026-11-20', amount: 100_000, cancelled: false },
      ],
      payments: [{ id: 'p', paidAt: '2026-10-01T00:00:00.000Z', net: 1_000_000 }],
      closedMonths: new Set(['2026-10']),
      startMonth: '2026-10',
    });
    expect(plan.reprice).toEqual([]);
    expect(plan.untouched).toEqual(['2026-10', '2026-11']);
    expect(plan.totalAfter).toBe(340_000);
    expect(plan.unallocated).toBe(660_000);
  });
});
