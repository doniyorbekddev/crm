import { describe, expect, it } from 'vitest';
import {
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_ORDER,
  ALERT_SEVERITY_TONES,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_ORDER,
  TARGET_TYPE_LABELS,
  TARGET_TYPE_ORDER,
} from './alertLabels';
import {
  ACCOUNT_TYPE_LABELS,
  CASH_FLOW_PERIODS,
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_ORDER,
  TRANSACTION_TYPE_TONES,
} from './financeLabels';
import {
  EXAM_STATUS_LABELS,
  EXAM_STATUS_ORDER,
  EXAM_STATUS_TONES,
  GRADE_TONES,
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_STATUS_ORDER,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_ORDER,
  SUBMISSION_STATUS_TONES,
  gradeLetter,
} from './homeworkLabels';
import {
  MONTH_OPTIONS,
  SALARY_STATUS_LABELS,
  SALARY_STATUS_ORDER,
  SALARY_STATUS_TONES,
  SALARY_TYPE_LABELS,
  SALARY_TYPE_ORDER,
  salaryRuleSummary,
} from './teacherLabels';

/** Tartib ro‘yxatidagi har bir qiymat uchun yorliq bor va ortiqcha yorliq yo‘q */
function expectComplete(order: readonly string[], labels: Record<string, string>) {
  expect(new Set(order).size).toBe(order.length);
  expect(Object.keys(labels).sort()).toEqual([...order].sort());
  for (const key of order) expect(labels[key]?.trim()).toBeTruthy();
}

const money = (value: number) => `${value.toLocaleString('uz-UZ')} so‘m`;

describe('maosh yorliqlari', () => {
  it('model va holatlar to‘liq', () => {
    expectComplete(SALARY_TYPE_ORDER, SALARY_TYPE_LABELS);
    expectComplete(SALARY_STATUS_ORDER, SALARY_STATUS_LABELS);
    expect(Object.keys(SALARY_STATUS_TONES).sort()).toEqual([...SALARY_STATUS_ORDER].sort());
    expect(MONTH_OPTIONS.map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('maosh modeli qisqa tavsifi turga mos', () => {
    const base = { baseSalary: 0, perLessonRate: 0, perStudentRate: 0, percentage: 0 };
    expect(salaryRuleSummary({ ...base, type: 'FIXED', baseSalary: 5_000_000 })).toBe(money(5_000_000));
    expect(salaryRuleSummary({ ...base, type: 'PER_LESSON', perLessonRate: 120_000 })).toBe(`${money(120_000)} / dars`);
    expect(salaryRuleSummary({ ...base, type: 'PER_STUDENT', perStudentRate: 250_000 })).toBe(`${money(250_000)} / o‘quvchi`);
    expect(salaryRuleSummary({ ...base, type: 'PERCENTAGE', percentage: 35 })).toBe('35% tushumdan');
    // Aralash: faqat noldan katta qismlar, " + " bilan
    expect(salaryRuleSummary({ ...base, type: 'MIXED', baseSalary: 2_000_000, percentage: 10 })).toBe(`${money(2_000_000)} + 10%`);
  });
});

describe('uy vazifasi va imtihon yorliqlari', () => {
  it('holatlar to‘liq', () => {
    expectComplete(HOMEWORK_STATUS_ORDER, HOMEWORK_STATUS_LABELS);
    expectComplete(SUBMISSION_STATUS_ORDER, SUBMISSION_STATUS_LABELS);
    expectComplete(EXAM_STATUS_ORDER, EXAM_STATUS_LABELS);
    expect(Object.keys(SUBMISSION_STATUS_TONES).sort()).toEqual([...SUBMISSION_STATUS_ORDER].sort());
    expect(Object.keys(EXAM_STATUS_TONES).sort()).toEqual([...EXAM_STATUS_ORDER].sort());
  });

  it('baho chegaralari backend bilan bir xil', () => {
    expect([100, 90, 89, 80, 79, 70, 69, 60, 59, 0].map(gradeLetter)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
    for (const grade of ['A', 'B', 'C', 'D', 'F']) expect(GRADE_TONES[grade]).toBeTruthy();
  });
});

describe('moliya yorliqlari', () => {
  it('tranzaksiya turlari, holatlari va kassalar to‘liq', () => {
    expectComplete(TRANSACTION_TYPE_ORDER, TRANSACTION_TYPE_LABELS);
    expect(Object.keys(TRANSACTION_TYPE_TONES).sort()).toEqual([...TRANSACTION_TYPE_ORDER].sort());
    expect(Object.keys(TRANSACTION_STATUS_LABELS).sort()).toEqual(['COMPLETED', 'REVERSED', 'VOID']);
    expect(Object.keys(ACCOUNT_TYPE_LABELS).sort()).toEqual(['BANK', 'CARD', 'CASH', 'CLICK', 'HUMO', 'OTHER', 'PAYME', 'UZCARD', 'UZUM']);
    expect(CASH_FLOW_PERIODS.map((period) => period.value)).toEqual(['day', 'week', 'month']);
  });

  it('daftar manbalari backenddagi entityType qiymatlarini qamraydi', () => {
    for (const entityType of ['payment', 'income', 'expense', 'teacherSalaryPayment', 'transfer', 'paymentRefund']) {
      expect(TRANSACTION_SOURCE_LABELS[entityType]).toBeTruthy();
    }
  });
});

describe('ogohlantirish va reja yorliqlari', () => {
  it('turlar, darajalar va rejalar to‘liq', () => {
    expectComplete(ALERT_TYPE_ORDER, ALERT_TYPE_LABELS);
    expectComplete(ALERT_SEVERITY_ORDER, ALERT_SEVERITY_LABELS);
    expect(Object.keys(ALERT_SEVERITY_TONES).sort()).toEqual([...ALERT_SEVERITY_ORDER].sort());
    expectComplete(TARGET_TYPE_ORDER, TARGET_TYPE_LABELS);
    // Kritik birinchi ko‘rsatiladi
    expect(ALERT_SEVERITY_ORDER[0]).toBe('CRITICAL');
  });
});
