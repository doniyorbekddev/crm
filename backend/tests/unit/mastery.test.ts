import { describe, expect, it } from 'vitest';
import { DEFAULT_MASTERY_SETTINGS, combineScore, masteryLevel, masteryStatus } from '../../src/services/mastery.service.js';

const settings = DEFAULT_MASTERY_SETTINGS;
const weights = settings.weights;

describe('mavzu o‘zlashtirish formulasi (TZ §27)', () => {
  it('baho faqat baholash dalili bo‘lsa: faqat davomat/dars — baho yo‘q', () => {
    expect(combineScore({ exam: null, homework: null, attendance: 100, lessons: 100 }, weights)).toBeNull();
    expect(combineScore({ exam: 80, homework: null, attendance: null, lessons: null }, weights)).toBe(80);
  });

  it('mavjud manbalar og‘irligi qayta normallashtiriladi', () => {
    // (50*50 + 70*30) / 80 = 57.5 → 58
    expect(combineScore({ exam: 50, homework: 70, attendance: null, lessons: null }, weights)).toBe(58);
    // (90*50 + 80*30 + 100*10 + 50*10) / 100 = 84
    expect(combineScore({ exam: 90, homework: 80, attendance: 100, lessons: 50 }, weights)).toBe(84);
    // Og'irligi 0 manba hisobga olinmaydi
    expect(combineScore({ exam: 40, homework: 100, attendance: null, lessons: null }, { ...weights, homework: 0 })).toBe(40);
  });

  it('holat va daraja standart chegaralar bo‘yicha (40/60/80)', () => {
    expect(masteryStatus(null, false, settings)).toBe('NOT_STARTED');
    expect(masteryStatus(null, true, settings)).toBe('LEARNING');
    expect([59, 60, 79, 80].map((score) => masteryStatus(score, true, settings))).toEqual(['LEARNING', 'PRACTICING', 'PRACTICING', 'MASTERED']);
    expect([0, 39, 40, 59, 60, 79, 80, 100].map((score) => masteryLevel(score, settings))).toEqual([
      'WEAK',
      'WEAK',
      'DEVELOPING',
      'DEVELOPING',
      'GOOD',
      'GOOD',
      'MASTERED',
      'MASTERED',
    ]);
  });

  it('chegaralar sozlanadi', () => {
    const custom = { ...settings, thresholds: { developing: 30, good: 50, mastered: 70 } };
    expect(masteryStatus(55, true, custom)).toBe('PRACTICING');
    expect(masteryLevel(72, custom)).toBe('MASTERED');
  });
});
