import { describe, expect, it } from 'vitest';
import { shiftWeek } from './week';

describe('shiftWeek', () => {
  it('haftani oldinga/orqaga suradi, oy va yil chegarasidan o‘tadi', () => {
    expect(shiftWeek('2026-09-21', -1)).toBe('2026-09-14');
    expect(shiftWeek('2026-09-28', 1)).toBe('2026-10-05');
    expect(shiftWeek('2026-01-05', -1)).toBe('2025-12-29');
  });
});
