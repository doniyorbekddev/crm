import { describe, expect, it } from 'vitest';
import { groupUz, moneyUz } from '../../src/utils/money.js';

describe('Pul formati (foydalanuvchiga ko‘rinadigan matnlar)', () => {
  it('uzilmas bo‘shliq bilan guruhlaydi va vergul ishlatmaydi', () => {
    expect(moneyUz(7_200_000)).toBe('7 200 000 so‘m');
    expect(groupUz(1_234)).toBe('1 234');
    expect(groupUz(999)).toBe('999');
    expect(moneyUz(1_000_000)).not.toContain(',');
  });

  it('manfiy summa, nol va kasrni to‘g‘ri ko‘rsatadi', () => {
    expect(moneyUz(-450_000)).toBe('-450 000 so‘m');
    expect(moneyUz(-0.2)).toBe('0 so‘m');
    expect(groupUz(1_234.6)).toBe('1 235');
  });

  it('frontenddagi format bilan bir xil natija beradi (bir xil qoida)', () => {
    // frontend/src/utils/format.ts dagi groupDigits bilan bir xil ajratkich
    for (const value of [0, 5, 999, 1_000, 12_345, 7_200_000, 999_999_999]) {
      expect(groupUz(value)).toBe(String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
    }
  });
});
