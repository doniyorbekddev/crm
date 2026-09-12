import { z } from 'zod';
import { optionalField } from './common.validator.js';
import { PAYMENT_METHODS } from './payment.validator.js';

export const SALARY_PERIOD_STATUSES = ['PENDING', 'CALCULATED', 'APPROVED', 'PARTIALLY_PAID', 'PAID'] as const;

const idSchema = z.string().trim().min(1).max(50);

const yearSchema = z.coerce
  .number('Yil raqam bo‘lishi kerak')
  .int('Yil butun son bo‘lishi kerak')
  .min(2020, 'Yil 2020 dan kichik bo‘lmasligi kerak')
  .max(2100, 'Yil 2100 dan katta bo‘lmasligi kerak');

const monthSchema = z.coerce
  .number('Oy raqam bo‘lishi kerak')
  .int('Oy butun son bo‘lishi kerak')
  .min(1, 'Oy 1 dan 12 gacha bo‘lishi kerak')
  .max(12, 'Oy 1 dan 12 gacha bo‘lishi kerak');

/** Oy tanlanmasa — joriy oy */
const now = () => new Date();

export const salaryPeriodListQuerySchema = z.object({
  year: yearSchema.default(() => now().getUTCFullYear()),
  month: monthSchema.default(() => now().getUTCMonth() + 1),
  teacherProfileId: idSchema.optional(),
  status: z.enum(SALARY_PERIOD_STATUSES, 'Holat noto‘g‘ri').optional(),
});

export const calculateSalarySchema = z.object({
  year: yearSchema,
  month: monthSchema,
  /** Bo‘sh bo‘lsa — barcha faol o‘qituvchilar uchun hisoblanadi */
  teacherProfileId: optionalField(idSchema),
});

/** Bonus va jarima faqat tasdiqlashdan oldin o‘zgartiriladi */
export const adjustSalarySchema = z
  .object({
    bonus: optionalField(
      z.coerce.number('Bonus raqam bo‘lishi kerak').int('Bonus butun son bo‘lishi kerak').min(0, 'Bonus manfiy bo‘lmasligi kerak').max(999_999_999, 'Bonus juda katta'),
    ),
    penalty: optionalField(
      z.coerce.number('Jarima raqam bo‘lishi kerak').int('Jarima butun son bo‘lishi kerak').min(0, 'Jarima manfiy bo‘lmasligi kerak').max(999_999_999, 'Jarima juda katta'),
    ),
    note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  })
  .refine(
    (values) => values.bonus !== undefined || values.penalty !== undefined || values.note !== undefined,
    'Kamida bitta maydonni o‘zgartiring',
  );

export const paySalarySchema = z.object({
  amount: z.coerce
    .number('Summa raqam bo‘lishi kerak')
    .int('Summa butun son bo‘lishi kerak')
    .min(1000, 'Eng kam to‘lov — 1 000 so‘m')
    .max(999_999_999, 'Summa juda katta'),
  method: z.enum(PAYMENT_METHODS, 'To‘lov usulini tanlang'),
  accountId: optionalField(idSchema),
  paidAt: optionalField(
    z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Sana noto‘g‘ri')
      .transform((value) => new Date(value)),
  ),
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const salaryHistoryQuerySchema = z.object({
  year: yearSchema.optional(),
  limit: z.coerce.number().int().min(1).max(36).default(12),
});

export type SalaryPeriodListQuery = z.infer<typeof salaryPeriodListQuerySchema>;
export type CalculateSalaryInput = z.infer<typeof calculateSalarySchema>;
export type AdjustSalaryInput = z.infer<typeof adjustSalarySchema>;
export type PaySalaryInput = z.infer<typeof paySalarySchema>;
export type SalaryHistoryQuery = z.infer<typeof salaryHistoryQuerySchema>;
