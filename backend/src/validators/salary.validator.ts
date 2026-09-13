import { z } from 'zod';
import { optionalField } from './common.validator.js';
import { PAYMENT_METHODS } from './payment.validator.js';

export const SALARY_PERIOD_STATUSES = ['PENDING', 'CALCULATED', 'APPROVED', 'PARTIALLY_PAID', 'PAID'] as const;

const idSchema = z.string().trim().min(1).max(50);

export const yearSchema = z.coerce
  .number('Yil raqam bo‘lishi kerak')
  .int('Yil butun son bo‘lishi kerak')
  .min(2020, 'Yil 2020 dan kichik bo‘lmasligi kerak')
  .max(2100, 'Yil 2100 dan katta bo‘lmasligi kerak');

export const monthSchema = z.coerce
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
  employeeId: idSchema.optional(),
  /** TEACHER — faqat o‘qituvchilar, EMPLOYEE — faqat xodimlar */
  payeeType: z.enum(['TEACHER', 'EMPLOYEE'], 'To‘lov oluvchi turi noto‘g‘ri').optional(),
  status: z.enum(SALARY_PERIOD_STATUSES, 'Holat noto‘g‘ri').optional(),
});

export const calculateSalarySchema = z
  .object({
    year: yearSchema,
    month: monthSchema,
    /** Ikkalasi ham bo‘sh bo‘lsa — barcha faol o‘qituvchi va xodimlar uchun hisoblanadi */
    teacherProfileId: optionalField(idSchema),
    employeeId: optionalField(idSchema),
  })
  .refine((values) => !(values.teacherProfileId && values.employeeId), {
    path: ['employeeId'],
    message: 'O‘qituvchi yoki xodimdan bittasini tanlang',
  });

/** Izoh — tasdiqlashdan oldin. Bonus va jarima alohida yozuv sifatida qo‘shiladi (POST /salaries/adjustments) */
export const adjustSalarySchema = z.object({
  note: z.string('Izoh kiriting').trim().max(255, 'Izoh juda uzun'),
  bonus: z.undefined('Bonus alohida yozuv sifatida qo‘shiladi — “Bonus / jarima” bo‘limidan foydalaning').optional(),
  penalty: z.undefined('Jarima alohida yozuv sifatida qo‘shiladi — “Bonus / jarima” bo‘limidan foydalaning').optional(),
});

export const PAYROLL_ADJUSTMENT_TYPES = ['BONUS', 'PENALTY'] as const;
export const PAYROLL_ADJUSTMENT_CATEGORIES = [
  'ATTENDANCE',
  'RETENTION',
  'PERFORMANCE',
  'MONTHLY',
  'SPECIAL',
  'LATENESS',
  'ABSENCE',
  'DISCIPLINE',
  'OTHER',
] as const;
export const BONUS_CATEGORIES: readonly string[] = ['ATTENDANCE', 'RETENTION', 'PERFORMANCE', 'MONTHLY', 'SPECIAL', 'OTHER'];
export const PENALTY_CATEGORIES: readonly string[] = ['LATENESS', 'ABSENCE', 'DISCIPLINE', 'OTHER'];
export const SALARY_PAYMENT_KINDS = ['SALARY', 'ADVANCE'] as const;

const reasonField = z
  .string('Sababni kiriting')
  .trim()
  .min(3, 'Sabab kamida 3 belgidan iborat bo‘lsin')
  .max(255, 'Sabab juda uzun');

export const createAdjustmentSchema = z
  .object({
    teacherProfileId: optionalField(idSchema),
    employeeId: optionalField(idSchema),
    year: yearSchema,
    month: monthSchema,
    type: z.enum(PAYROLL_ADJUSTMENT_TYPES, 'Turini tanlang'),
    category: z.enum(PAYROLL_ADJUSTMENT_CATEGORIES, 'Toifani tanlang'),
    amount: z.coerce
      .number('Summa raqam bo‘lishi kerak')
      .int('Summa butun son bo‘lishi kerak')
      .min(1000, 'Eng kam summa — 1 000 so‘m')
      .max(999_999_999, 'Summa juda katta'),
    reason: reasonField,
    date: z
      .string('Sanani kiriting')
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-09-15')
      .transform((value) => new Date(`${value}T00:00:00.000Z`)),
  })
  .superRefine((values, context) => {
    if (Boolean(values.teacherProfileId) === Boolean(values.employeeId)) {
      context.addIssue({ code: 'custom', path: ['employeeId'], message: 'O‘qituvchi yoki xodimdan aynan bittasini tanlang' });
    }
    const allowed = values.type === 'BONUS' ? BONUS_CATEGORIES : PENALTY_CATEGORIES;
    if (!allowed.includes(values.category)) {
      context.addIssue({ code: 'custom', path: ['category'], message: 'Toifa tanlangan turga mos emas' });
    }
    if (values.date.getUTCFullYear() !== values.year || values.date.getUTCMonth() + 1 !== values.month) {
      context.addIssue({ code: 'custom', path: ['date'], message: 'Sana maosh oyi ichida bo‘lishi kerak' });
    }
  });

/** Bekor qilish va qayta ochish — sabab majburiy (auditda saqlanadi) */
export const reasonSchema = z.object({ reason: reasonField });

export const paySalarySchema = z.object({
  /** ADVANCE — hisoblangan, lekin tasdiqlanmagan maoshdan avans */
  kind: z.enum(SALARY_PAYMENT_KINDS, 'To‘lov turi noto‘g‘ri').default('SALARY'),
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
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type ReasonInput = z.infer<typeof reasonSchema>;
export type SalaryHistoryQuery = z.infer<typeof salaryHistoryQuerySchema>;
