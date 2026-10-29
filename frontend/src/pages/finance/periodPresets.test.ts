import { describe, expect, it } from 'vitest';
import { matchPreset, presetRange } from './periodPresets';

describe('periodPresets', () => {
  const today = new Date(2026, 0, 15); // 15-yanvar: o'tgan oy va 3 oy yil chegarasidan o'tadi

  it('davr chegaralari mahalliy kun bo‘yicha, yil almashinuvi bilan', () => {
    expect(presetRange('all', today)).toEqual({ from: '', to: '' });
    expect(presetRange('this-month', today)).toEqual({ from: '2026-01-01', to: '2026-01-15' });
    expect(presetRange('last-month', today)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('quarter', today)).toEqual({ from: '2025-11-01', to: '2026-01-15' });
    expect(presetRange('this-year', today)).toEqual({ from: '2026-01-01', to: '2026-01-15' });
    // Kabisa yili: fevral oxiri
    expect(presetRange('last-month', new Date(2028, 2, 3))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('qo‘lda kiritilgan sanalar mos tez davrni topadi, aks holda oraliq', () => {
    expect(matchPreset('', '', today)).toBe('all');
    expect(matchPreset('2025-12-01', '2025-12-31', today)).toBe('last-month');
    // "Shu oy" va "Bu yil" yanvarda bir xil — birinchisi tanlanadi
    expect(matchPreset('2026-01-01', '2026-01-15', today)).toBe('this-month');
    expect(matchPreset('2026-01-02', '2026-01-15', today)).toBeNull();
    expect(matchPreset('2026-01-01', '', today)).toBeNull();
  });
});
