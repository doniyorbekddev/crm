import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'CLICK', 'PAYME', 'UZUM', 'BANK', 'OTHER'] as const;
export const DEBT_RANGES = ['all', 'zero', 'upto500k', '500k-1m', '1m-plus'] as const;

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

export const paymentListQuerySchema = paginationQuerySchema.extend({
  studentId: idSchema.optional(),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  managerId: idSchema.optional(),
  method: z.enum(PAYMENT_METHODS, 'To‘lov usuli noto‘g‘ri').optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  /** Bekor qilingan to‘lovlarni ham ko‘rsatish */
  includeDeleted: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  sortBy: z.enum(['paidAt', 'amount', 'number']).default('paidAt'),
});

export const createPaymentSchema = z.object({
  studentId: z.string('O‘quvchini tanlang').trim().min(1, 'O‘quvchini tanlang').max(50),
  amount: z.coerce
    .number('Summa raqam bo‘lishi kerak')
    .int('Summa butun son bo‘lishi kerak')
    .min(1000, 'Eng kam to‘lov — 1 000 so‘m')
    .max(999_999_999, 'Summa juda katta'),
  method: z.enum(PAYMENT_METHODS, 'To‘lov usulini tanlang'),
  /** Bo‘sh bo‘lsa — hozirgi vaqt */
  paidAt: optionalField(
    z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Sana noto‘g‘ri')
      .transform((value) => new Date(value)),
  ),
  comment: optionalField(z.string().trim().max(500, 'Izoh juda uzun')),
  /** Forma ochilganda yaratiladigan kalit — ikki marta bosish yoki tarmoq qayta urinishi yangi to‘lov yaratmaydi */
  idempotencyKey: optionalField(z.string().trim().regex(/^[A-Za-z0-9-]{16,64}$/, 'So‘rov kaliti noto‘g‘ri')),
  /** Yaqinda xuddi shu summa qabul qilingan bo‘lsa ham saqlash — foydalanuvchi alohida to‘lov ekanini tasdiqlagan */
  confirmDuplicate: z.boolean().default(false),
});

export const deletePaymentSchema = z.object({
  reason: z
    .string('Bekor qilish sababini yozing')
    .trim()
    .min(5, 'Sabab kamida 5 belgidan iborat bo‘lsin')
    .max(255, 'Sabab 255 belgidan oshmasligi kerak'),
});

/** To‘lovni to‘liq yoki qisman qaytarish */
export const refundPaymentSchema = z.object({
  amount: z.coerce
    .number('Summa raqam bo‘lishi kerak')
    .int('Summa butun son bo‘lishi kerak')
    .min(1000, 'Eng kam qaytarish — 1 000 so‘m')
    .max(999_999_999, 'Summa juda katta'),
  method: z.enum(PAYMENT_METHODS, 'Qaytarish usulini tanlang'),
  accountId: optionalField(z.string().trim().min(1).max(50)),
  reason: z
    .string('Qaytarish sababini yozing')
    .trim()
    .min(5, 'Sabab kamida 5 belgidan iborat bo‘lsin')
    .max(255, 'Sabab 255 belgidan oshmasligi kerak'),
});

export const debtListQuerySchema = paginationQuerySchema.extend({
  range: z.enum(DEBT_RANGES, 'Qarz oralig‘i noto‘g‘ri').default('all'),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  sortBy: z.enum(['remaining', 'name', 'startDate']).default('remaining'),
});

export const paymentStatsQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  courseId: idSchema.optional(),
  groupId: idSchema.optional(),
  managerId: idSchema.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  studentId: idSchema.optional(),
});

export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type DeletePaymentInput = z.infer<typeof deletePaymentSchema>;
export type RefundPaymentInput = z.infer<typeof refundPaymentSchema>;
export type DebtListQuery = z.infer<typeof debtListQuerySchema>;
export type PaymentStatsQuery = z.infer<typeof paymentStatsQuerySchema>;
export type DebtRange = (typeof DEBT_RANGES)[number];
