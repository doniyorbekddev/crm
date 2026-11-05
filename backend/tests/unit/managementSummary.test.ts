import { describe, expect, it } from 'vitest';
import { buildManagementSummary } from '../../src/services/org/managementSummary.js';
import type { SummaryInput } from '../../src/services/org/managementSummary.js';
import { groupUz } from '../../src/utils/money.js';

const EMPTY: SummaryInput = {
  attendance: null,
  team: null,
  tasks: null,
  kpi: null,
  academic: null,
  payments: null,
  expenses: null,
  complaints: null,
  marketing: null,
  approvals: null,
  changes: null,
};

describe('boshqaruv xulosasi', () => {
  it('ma’lumot yo‘q — xulosa ham yo‘q (o‘ylab topilmaydi)', () => {
    expect(buildManagementSummary(EMPTY)).toEqual([]);
  });

  it('salbiylar oldin; har fikr manba ko‘rsatkichi va havola bilan; ko‘pi bilan 8 ta', () => {
    const result = buildManagementSummary({
      ...EMPTY,
      tasks: { overdue: 0, review: 1, doneThisMonth: 12 },
      academic: { attendanceRate: 78, droppedStudents: 2, newStudents: 5 },
      kpi: { month: '2026-yil oktabr', below: [{ name: 'Akmal', achievement: 62 }] },
      changes: { revenue: -15, conversionRate: 6 },
      payments: { revenue: 30_000_000, dueDebt: 5_833_000, dueDebtors: 14 },
    });
    expect(result.map((item) => [item.key, item.tone])).toEqual([
      ['kpi_below', 'negative'],
      ['due_debt', 'negative'],
      ['student_attendance', 'negative'],
      ['dropped', 'negative'],
      ['revenue_down', 'negative'],
      ['conversion_up', 'positive'],
      ['tasks_good', 'positive'],
      ['new_students', 'positive'],
    ]);
    expect(result.find((item) => item.key === 'revenue_down')).toMatchObject({ text: 'Tushum oldingi davrga nisbatan 15% kamaydi', metric: { label: 'Shu oy tushum', value: `${groupUz(30_000_000)} so‘m` } });
    expect(result.every((item) => item.link.startsWith('/'))).toBe(true);
  });

  it('kichik o‘zgarishlar (10% / 5 punktdan kam) va me’yordagi davomat xulosaga chiqmaydi', () => {
    expect(buildManagementSummary({ ...EMPTY, changes: { revenue: 4, conversionRate: -2 }, academic: { attendanceRate: 91, droppedStudents: 0, newStudents: 0 } })).toEqual([]);
  });
});
