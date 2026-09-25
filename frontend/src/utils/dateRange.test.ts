import { describe, expect, it } from 'vitest';
import { resolveDateRange } from './dateRange';

/** 2026-yil 16-sentabr, chorshanba */
const TODAY = new Date(2026, 8, 16, 14, 30);

describe('resolveDateRange', () => {
  it('kun, hafta (dushanbadan) va oy davrlari', () => {
    expect(resolveDateRange('today', TODAY)).toEqual({ from: '2026-09-16', to: '2026-09-16' });
    expect(resolveDateRange('yesterday', TODAY)).toEqual({ from: '2026-09-15', to: '2026-09-15' });
    expect(resolveDateRange('this_week', TODAY)).toEqual({ from: '2026-09-14', to: '2026-09-16' });
    expect(resolveDateRange('last_week', TODAY)).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    expect(resolveDateRange('this_month', TODAY)).toEqual({ from: '2026-09-01', to: '2026-09-16' });
    expect(resolveDateRange('last_month', TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('chorak, yil, yakshanba va yil boshi chegaralari', () => {
    expect(resolveDateRange('this_quarter', TODAY)).toEqual({ from: '2026-07-01', to: '2026-09-16' });
    expect(resolveDateRange('this_year', TODAY)).toEqual({ from: '2026-01-01', to: '2026-09-16' });
    // Yakshanba — hafta dushanbasi 6 kun oldin
    expect(resolveDateRange('this_week', new Date(2026, 8, 20))).toEqual({ from: '2026-09-14', to: '2026-09-20' });
    // Yanvarda o'tgan oy — o'tgan yilning dekabri
    expect(resolveDateRange('last_month', new Date(2027, 0, 5))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    // O'tgan yil — to'liq kalendar yili (kabisa yili ham)
    expect(resolveDateRange('last_year', TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolveDateRange('last_year', new Date(2025, 0, 1))).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(resolveDateRange('custom', TODAY)).toBeNull();
    expect(resolveDateRange('all', TODAY)).toBeNull();
  });

  it('GAP-04: TZ talab qilgan barcha davrlar standart ro‘yxatda', async () => {
    const { STANDARD_PRESETS } = await import('./dateRange');
    for (const preset of ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'custom'] as const) {
      expect(STANDARD_PRESETS).toContain(preset);
    }
    expect(STANDARD_PRESETS).toContain('last_year');
  });
});
