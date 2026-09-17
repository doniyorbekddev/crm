import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPhone,
  formatRelativeTime,
  formatTime,
  fromDateTimeInputValue,
} from './format';

describe('pul va sonlar', () => {
  it('summani uzilmas bo‘shliq bilan ajratadi (brauzer lokalidan qat’i nazar)', () => {
    expect(formatMoney(1_500_000)).toBe('1\u00a0500\u00a0000 so‘m');
    expect(formatNumber(1234)).toBe('1\u00a0234');
    expect(formatNumber(999)).toBe('999');
    expect(formatMoney(7_200_000)).not.toContain(',');
  });

  it('manfiy summa, nol va kasr sonlarni to‘g‘ri ko‘rsatadi', () => {
    expect(formatMoney(-450_000)).toBe('-450\u00a0000 so‘m');
    expect(formatMoney(-0.2)).toBe('0 so‘m');
    expect(formatNumber(1_234.6)).toBe('1\u00a0235');
    expect(formatMoney('1234567.89')).toBe('1\u00a0234\u00a0568 so‘m');
  });

  it('matn ko‘rinishidagi sonni ham qabul qiladi', () => {
    expect(formatMoney('250000')).toContain('250');
    expect(formatNumber('42')).toBe('42');
  });

  it('bo‘sh yoki noto‘g‘ri qiymat uchun nol qaytaradi', () => {
    expect(formatMoney(null)).toContain('0');
    expect(formatMoney(undefined)).toContain('0');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('sana va vaqt', () => {
  it('sanani kun.oy.yil ko‘rinishida chiqaradi', () => {
    expect(formatDate('2026-09-11T10:30:00.000Z')).toBe('11.09.2026');
    expect(formatDateTime('2026-09-11T10:30:00.000Z')).toMatch(/^11\.09\.2026 \d{2}:\d{2}$/);
    expect(formatTime('2026-09-11T10:30:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('bo‘sh yoki buzilgan sana uchun chiziqcha qaytaradi', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('buzilgan-sana')).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('datetime-local qiymatini ISO ga o‘giradi', () => {
    expect(fromDateTimeInputValue('')).toBeUndefined();
    expect(fromDateTimeInputValue('buzilgan')).toBeUndefined();
    expect(fromDateTimeInputValue('2026-09-11T15:30')).toMatch(/^2026-09-11T\d{2}:\d{2}:00\.000Z$/);
  });
});

describe('nisbiy vaqt', () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

  it('yaqin vaqtlarni o‘zbekcha yozadi', () => {
    expect(formatRelativeTime(minutesAgo(0))).toBe('hozirgina');
    expect(formatRelativeTime(minutesAgo(5))).toBe('5 daqiqa oldin');
    expect(formatRelativeTime(minutesAgo(120))).toBe('2 soat oldin');
    expect(formatRelativeTime(minutesAgo(60 * 24 * 3))).toBe('3 kun oldin');
  });

  it('bir haftadan eski sana to‘liq ko‘rinishda chiqadi', () => {
    expect(formatRelativeTime(minutesAgo(60 * 24 * 30))).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('bo‘sh qiymat uchun chiziqcha', () => {
    expect(formatRelativeTime(null)).toBe('—');
    expect(formatRelativeTime('buzilgan')).toBe('—');
  });
});

describe('telefon', () => {
  it('O‘zbekiston raqamini guruhlarga ajratadi', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it('boshqa formatlarni o‘zgartirmaydi', () => {
    expect(formatPhone('+7 999 123 45 67')).toBe('+7 999 123 45 67');
    expect(formatPhone(null)).toBe('—');
  });
});

describe('davomiylik', () => {
  it('soniyalarni o‘qiladigan ko‘rinishga o‘giradi', () => {
    expect(formatDuration(45)).toBe('45 soniya');
    expect(formatDuration(90)).toBe('1 daqiqa 30 soniya');
    expect(formatDuration(120)).toBe('2 daqiqa');
    expect(formatDuration(3725)).toBe('1 soat 2 daqiqa');
    expect(formatDuration(7200)).toBe('2 soat');
    expect(formatDuration(90_000)).toBe('1 kun 1 soat');
  });

  it('manfiy qiymatni nol deb hisoblaydi', () => {
    expect(formatDuration(-10)).toBe('0 soniya');
  });
});
