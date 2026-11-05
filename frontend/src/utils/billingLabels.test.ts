import { describe, expect, it } from 'vitest';
import { periodKeyLabel, previewAutoAllocation } from './billingLabels';

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
});
