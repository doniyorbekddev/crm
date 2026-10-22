import type { CourseCategory } from '@/types/course';

export type PaymentSummaryScope = 'ALL' | 'STUDYING' | 'FINISHED' | 'DROPPED';

export interface PaymentSummaryTotals {
  students: number;
  activeStudents: number;
  debtors: number;
  /** Shartnoma balansi yo'q o'quvchilar (summaga kirmaydi) */
  withoutContract: number;
  /** Jami yig'ilishi kerak — shartnomalar summasi */
  expected: number;
  collected: number;
  remaining: number;
  /** To'lov jadvali bo'yicha muddati o'tgan qism */
  overdue: number;
  /** Joriy oyda tushgan (qaytarishlar ayrilgan) */
  monthCollected: number;
  collectedPercent: number | null;
}

export interface PaymentSummaryRow extends PaymentSummaryTotals {
  courseId: string;
  courseName: string;
  category: CourseCategory;
  categoryLabel: string;
  courseStatus: string;
}

export interface PaymentSummary {
  scope: PaymentSummaryScope;
  scopeLabel: string;
  month: { year: number; month: number };
  generatedAt: string;
  totals: PaymentSummaryTotals;
  courses: PaymentSummaryRow[];
}
