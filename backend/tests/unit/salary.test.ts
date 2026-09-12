import { describe, expect, it } from 'vitest';
import { formatSalaryPeriod } from '../../src/config/salaryLabels.js';
import { computeSalaryParts, monthRange } from '../../src/services/salary.service.js';
import type { SalaryRates } from '../../src/services/salary.service.js';

const WORKLOAD = { lessonsCount: 12, studentsCount: 8, groupRevenue: 24_000_000 };

function rates(overrides: Partial<SalaryRates> & Pick<SalaryRates, 'type'>): SalaryRates {
  return { baseSalary: 0, perLessonRate: 0, perStudentRate: 0, percentage: 0, ...overrides };
}

describe('maosh hisobi', () => {
  it('belgilangan maoshda faqat asosiy summa hisoblanadi', () => {
    const parts = computeSalaryParts(rates({ type: 'FIXED', baseSalary: 5_000_000, perLessonRate: 999 }), WORKLOAD);
    expect(parts).toEqual({ baseAmount: 5_000_000, lessonAmount: 0, studentAmount: 0, percentageAmount: 0 });
  });

  it('dars uchun model darslar soniga ko‘paytiradi', () => {
    const parts = computeSalaryParts(rates({ type: 'PER_LESSON', perLessonRate: 120_000 }), WORKLOAD);
    expect(parts.lessonAmount).toBe(1_440_000);
    expect(parts.baseAmount).toBe(0);
  });

  it('o‘quvchi uchun model o‘quvchilar soniga ko‘paytiradi', () => {
    const parts = computeSalaryParts(rates({ type: 'PER_STUDENT', perStudentRate: 250_000 }), WORKLOAD);
    expect(parts.studentAmount).toBe(2_000_000);
  });

  it('ulush modeli tushumdan foiz oladi va butun so‘mga yaxlitlaydi', () => {
    expect(computeSalaryParts(rates({ type: 'PERCENTAGE', percentage: 35 }), WORKLOAD).percentageAmount).toBe(8_400_000);
    expect(
      computeSalaryParts(rates({ type: 'PERCENTAGE', percentage: 33.33 }), { ...WORKLOAD, groupRevenue: 1_000_001 })
        .percentageAmount,
    ).toBe(333_300);
  });

  it('aralash modelda barcha tarkibiy qismlar qo‘shiladi', () => {
    const parts = computeSalaryParts(
      rates({ type: 'MIXED', baseSalary: 2_000_000, perLessonRate: 50_000, perStudentRate: 100_000, percentage: 10 }),
      WORKLOAD,
    );
    expect(parts).toEqual({
      baseAmount: 2_000_000,
      lessonAmount: 600_000,
      studentAmount: 800_000,
      percentageAmount: 2_400_000,
    });
  });

  it('yuklama nol bo‘lsa summalar ham nol', () => {
    const parts = computeSalaryParts(rates({ type: 'MIXED', perLessonRate: 120_000, percentage: 20 }), {
      lessonsCount: 0,
      studentsCount: 0,
      groupRevenue: 0,
    });
    expect(parts).toEqual({ baseAmount: 0, lessonAmount: 0, studentAmount: 0, percentageAmount: 0 });
  });
});

describe('maosh davri', () => {
  it('oy oralig‘i UTC bo‘yicha yopiq-ochiq interval', () => {
    const { start, end } = monthRange(2026, 9);
    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('dekabrdan keyin yil almashadi', () => {
    expect(monthRange(2026, 12).end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('davr nomi o‘zbekcha yoziladi', () => {
    expect(formatSalaryPeriod(2026, 9)).toBe('2026-yil sentabr');
    expect(formatSalaryPeriod(2027, 1)).toBe('2027-yil yanvar');
  });
});
