import { describe, expect, it } from 'vitest';
import { allocateToSelected, dueCountdown, periodKeyLabel, previewAutoAllocation } from './billingLabels';

describe('billingLabels', () => {
  it('oy kalitini o‘qiladigan nomga aylantiradi', () => {
    expect(periodKeyLabel('2026-10')).toBe('Oktabr 2026');
  });

  it('avtomatik taqsimot eng eski ochiq oydan boshlaydi va qisman to‘lovda qoldiq qoldiradi', () => {
    const open = [
      { key: '2026-11', remaining: 600_000 },
      { key: '2026-10', remaining: 600_000 },
    ];
    expect(previewAutoAllocation(open, 900_000)).toEqual([
      { key: '2026-10', amount: 600_000 },
      { key: '2026-11', amount: 300_000 },
    ]);
    expect(previewAutoAllocation(open, 300_000)).toEqual([{ key: '2026-10', amount: 300_000 }]);
    expect(previewAutoAllocation(open, 0)).toEqual([]);
  });

  it('to‘lov kuniga nisbatan: kechikdi / bugun / necha kun qoldi (oyma-oy, kunma-kun summa emas)', () => {
    // 11-noyabr: to'lov kuni 15 — 4 kun qoldi; to'lov kuni 5 — 6 kun kechikdi; oktyabr 5 — 37 kun
    expect(dueCountdown('2026-11-15', '2026-11-11')).toEqual({ kind: 'upcoming', days: 4, text: '4 kun qoldi' });
    expect(dueCountdown('2026-11-05', '2026-11-11')).toEqual({ kind: 'overdue', days: 6, text: '6 kun kechikdi' });
    expect(dueCountdown('2026-10-05', '2026-11-11').days).toBe(37);
    expect(dueCountdown('2026-11-11', '2026-11-11').kind).toBe('today');
  });

  it('tanlangan oylarga eskisidan to‘liq qoldig‘igacha taqsimlaydi, ortiqchani ko‘rsatadi', () => {
    const selected = [
      { key: '2026-11', remaining: 600_000 },
      { key: '2026-10', remaining: 600_000 },
    ];
    expect(allocateToSelected(selected, 600_000)).toEqual({ items: [{ key: '2026-10', amount: 600_000 }], excess: 0 });
    expect(allocateToSelected(selected, 1_000_000).items).toEqual([
      { key: '2026-10', amount: 600_000 },
      { key: '2026-11', amount: 400_000 },
    ]);
    expect(allocateToSelected(selected, 1_500_000).excess).toBe(300_000);
  });
});
