import { z } from 'zod';
import { paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

const periodKey = z
  .string('Oyni tanlang')
  .trim()
  .regex(/^(20\d{2})-(0[1-9]|1[0-2])$/, 'Oy noto‘g‘ri (format: 2026-10)');

const amountBound = z.coerce.number('Summa raqam bo‘lishi kerak').min(0, 'Summa manfiy bo‘lmasin').max(999_999_999).optional();

const billingFilter = {
  groupId: idSchema.optional(),
  courseId: idSchema.optional(),
  teacherId: idSchema.optional(),
  minAmount: amountBound,
  maxAmount: amountBound,
  search: z.string().trim().max(100).optional(),
};

export const MONTHLY_DEBT_STATUSES = ['DEBT', 'UPCOMING', 'ALL', 'UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'] as const;

/** A. Tanlangan oy majburiyatlari / qarzdorlari */
export const monthlyDebtorsQuerySchema = paginationQuerySchema.extend({
  ...billingFilter,
  period: periodKey,
  /** DEBT — muddati kelgan va qoldig'i bor (standart); UPCOMING — qoldig'i bor, muddati hali kelmagan */
  status: z.enum(MONTHLY_DEBT_STATUSES, 'Holat noto‘g‘ri').default('DEBT'),
  sortBy: z.enum(['remaining', 'name', 'dueDate']).default('remaining'),
});

/** B. Barcha oylardan qolgan (muddati kelgan) qarzlar */
export const outstandingDebtsQuerySchema = paginationQuerySchema.extend({
  ...billingFilter,
  /** O'tgan oy berilsa — o'sha oy oxiridagi holat (berilmasa yoki joriy oy — bugungi holat) */
  period: periodKey.optional(),
  sortBy: z.enum(['debt', 'oldest', 'name']).default('debt'),
});

/** Oylik hisobot: hisoblangan / shu oy uchun yig'ilgan / kassa tushumi / qarz */
export const billingReportQuerySchema = z
  .object({
    from: periodKey,
    to: periodKey,
    groupId: idSchema.optional(),
    courseId: idSchema.optional(),
    teacherId: idSchema.optional(),
  })
  .refine((query) => query.from <= query.to, { message: 'Boshlanish oyi tugash oyidan keyin bo‘lmasin', path: ['from'] });

export type MonthlyDebtorsQuery = z.infer<typeof monthlyDebtorsQuerySchema>;
export type OutstandingDebtsQuery = z.infer<typeof outstandingDebtsQuerySchema>;
export type BillingReportQuery = z.infer<typeof billingReportQuerySchema>;
export type MonthlyDebtStatus = (typeof MONTHLY_DEBT_STATUSES)[number];
