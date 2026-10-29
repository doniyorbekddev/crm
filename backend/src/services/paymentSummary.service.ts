import { prisma } from '../config/database.js';
import type { CourseCategory, Prisma, StudentStatus } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { businessMonthRange, currentBusinessMonth } from '../utils/dates.js';
import type { ExportTable } from '../utils/tableExport.js';
import { branchScopeOf, inBranch } from './branchScope.js';
import { scheduleDueStats } from './paymentSchedule.service.js';
import { refundsBy } from './revenue.js';

/**
 * To'lov xulosasi — bitta joyda: jami yig'ilishi kerak (shartnomalar), yig'ilgan, qolgan, muddati o'tgan
 * va har yo'nalish (kurs) bo'yicha o'quvchilar soni, tushum va qarz.
 *
 * Manba — o'quvchining shartnoma balansi (Debt): to'lov, bekor qilish va qaytarishlardan keyin qayta hisoblanadi,
 * shuning uchun qarzdorlik sahifasi bilan bir xil. Yo'nalish — o'quvchining asosiy kursi (PMT qo'shimcha guruhi
 * alohida shartnoma yaratmaydi). "Shu oy tushgan" — to'lov paytidagi kurs bo'yicha, qaytarishlar ayrilgan.
 */

export const PAYMENT_SUMMARY_SCOPES = ['ALL', 'STUDYING', 'FINISHED', 'DROPPED'] as const;
export type PaymentSummaryScope = (typeof PAYMENT_SUMMARY_SCOPES)[number];

const SCOPE_STATUSES: Record<PaymentSummaryScope, StudentStatus[] | null> = {
  ALL: null,
  STUDYING: ['ACTIVE', 'FROZEN'],
  FINISHED: ['COMPLETED', 'GRADUATED', 'ALUMNI'],
  DROPPED: ['DROPPED'],
};

const SCOPE_LABELS: Record<PaymentSummaryScope, string> = {
  ALL: 'Barcha o‘quvchilar',
  STUDYING: 'O‘qiyotganlar (faol va muzlatilgan)',
  FINISHED: 'Bitirganlar',
  DROPPED: 'Ketganlar',
};

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  PROGRAMMING: 'Dasturlash',
  LANGUAGE: 'Til',
  DESIGN: 'Dizayn',
  COMPUTER_LITERACY: 'Kompyuter savodxonligi',
  SCHOOL_PREPARATION: 'Maktab tayyorlov',
  OTHER: 'Boshqa',
};

export interface PaymentSummaryTotals {
  students: number;
  /** Shu ro'yxatdagi faol o'quvchilar */
  activeStudents: number;
  /** Qoldig'i bor o'quvchilar */
  debtors: number;
  /** Shartnoma balansi yo'q o'quvchilar (summaga kirmaydi) */
  withoutContract: number;
  /** Jami yig'ilishi kerak — shartnomalar summasi (chegirmalardan keyin) */
  expected: number;
  collected: number;
  remaining: number;
  /** To'lov jadvali bo'yicha muddati o'tgan qism (jadvali borlar) */
  overdue: number;
  /** Joriy oyda tushgan (qaytarishlar ayrilgan) */
  monthCollected: number;
  /** Yig'ilgan / yig'ilishi kerak, % (shartnoma bo'lmasa — null) */
  collectedPercent: number | null;
}

export interface PaymentSummaryRow extends PaymentSummaryTotals {
  courseId: string;
  courseName: string;
  category: CourseCategory;
  categoryLabel: string;
  courseStatus: string;
}

export interface PaymentSummaryDto {
  scope: PaymentSummaryScope;
  scopeLabel: string;
  month: { year: number; month: number };
  generatedAt: string;
  totals: PaymentSummaryTotals;
  courses: PaymentSummaryRow[];
}

function emptyTotals(): PaymentSummaryTotals {
  return { students: 0, activeStudents: 0, debtors: 0, withoutContract: 0, expected: 0, collected: 0, remaining: 0, overdue: 0, monthCollected: 0, collectedPercent: null };
}

function finish<T extends PaymentSummaryTotals>(row: T): T {
  row.collectedPercent = row.expected > 0 ? Math.round((row.collected / row.expected) * 1000) / 10 : null;
  return row;
}

export const paymentSummaryService = {
  async summary(actor: AuthUser, scope: PaymentSummaryScope = 'ALL', now: Date = new Date()): Promise<PaymentSummaryDto> {
    const branch = await branchScopeOf(actor);
    const statuses = SCOPE_STATUSES[scope];
    const studentWhere: Prisma.StudentWhereInput = { deletedAt: null, ...inBranch(branch), ...(statuses ? { status: { in: statuses } } : {}) };
    const month = currentBusinessMonth(now);
    const range = businessMonthRange(month.year, month.month);

    const [courses, students, monthPayments] = await Promise.all([
      prisma.course.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, category: true, categoryLabel: true, status: true } }),
      prisma.student.findMany({
        where: studentWhere,
        select: { id: true, courseId: true, status: true, debt: { select: { totalAmount: true, paidAmount: true, remainingAmount: true } } },
      }),
      prisma.payment.groupBy({
        by: ['courseId'],
        where: { deletedAt: null, ...inBranch(branch), paidAt: { gte: range.start, lt: range.end }, student: studentWhere },
        _sum: { amount: true },
      }),
    ]);
    const [due, monthRefunds] = await Promise.all([
      scheduleDueStats(now, students.map((student) => student.id)),
      refundsBy('courseId', { gte: range.start, lt: range.end }, { ...inBranch(branch), student: studentWhere }),
    ]);

    const rows = new Map<string, PaymentSummaryRow>(
      courses.map((course) => [
        course.id,
        { courseId: course.id, courseName: course.name, category: course.category, categoryLabel: course.categoryLabel ?? CATEGORY_LABELS[course.category], courseStatus: course.status, ...emptyTotals() },
      ]),
    );
    const totals = emptyTotals();
    for (const student of students) {
      const row = rows.get(student.courseId);
      for (const target of row ? [row, totals] : [totals]) {
        target.students += 1;
        if (student.status === 'ACTIVE') target.activeStudents += 1;
        if (!student.debt) {
          target.withoutContract += 1;
          continue;
        }
        const remaining = student.debt.remainingAmount.toNumber();
        target.expected += student.debt.totalAmount.toNumber();
        target.collected += student.debt.paidAmount.toNumber();
        target.remaining += remaining;
        if (remaining > 0) target.debtors += 1;
        target.overdue += due.get(student.id)?.overdueAmount ?? 0;
      }
    }
    for (const payment of monthPayments) {
      const amount = (payment._sum.amount?.toNumber() ?? 0) - (monthRefunds.get(payment.courseId) ?? 0);
      const row = rows.get(payment.courseId);
      if (row) row.monthCollected += amount;
      totals.monthCollected += amount;
    }

    // Arxivdagi, o'quvchisi va tushumi yo'q kurslar ro'yxatni to'ldirmasin
    const list = [...rows.values()]
      .filter((row) => row.students > 0 || row.monthCollected !== 0 || row.courseStatus === 'ACTIVE')
      .map(finish)
      .sort((a, b) => b.expected - a.expected || b.students - a.students || a.courseName.localeCompare(b.courseName, 'uz'));

    return { scope, scopeLabel: SCOPE_LABELS[scope], month, generatedAt: now.toISOString(), totals: finish(totals), courses: list };
  },

  toExport(summary: PaymentSummaryDto): ExportTable {
    return {
      title: 'To‘lov xulosasi — yo‘nalishlar bo‘yicha',
      subtitle: `${summary.scopeLabel} · ${new Date(summary.generatedAt).toISOString().slice(0, 10)} holatiga`,
      columns: [
        { key: 'courseName', label: 'Yo‘nalish (kurs)', type: 'text' },
        { key: 'categoryLabel', label: 'Toifa', type: 'text' },
        { key: 'students', label: 'O‘quvchilar', type: 'number' },
        { key: 'activeStudents', label: 'Faol', type: 'number' },
        { key: 'expected', label: 'Yig‘ilishi kerak', type: 'money' },
        { key: 'collected', label: 'Yig‘ilgan', type: 'money' },
        { key: 'remaining', label: 'Qolgan (qarz)', type: 'money' },
        { key: 'overdue', label: 'Muddati o‘tgan', type: 'money' },
        { key: 'debtors', label: 'Qarzdorlar', type: 'number' },
        { key: 'collectedPercent', label: 'Yig‘ilish %', type: 'percent' },
        { key: 'monthCollected', label: 'Shu oy tushgan', type: 'money' },
      ],
      rows: summary.courses.map((row) => ({ ...row })),
      totals: {
        students: summary.totals.students,
        activeStudents: summary.totals.activeStudents,
        expected: summary.totals.expected,
        collected: summary.totals.collected,
        remaining: summary.totals.remaining,
        overdue: summary.totals.overdue,
        debtors: summary.totals.debtors,
        monthCollected: summary.totals.monthCollected,
      },
    };
  },
};
