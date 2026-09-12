import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const TRANSACTION_TYPES = ['INCOME', 'EXPENSE', 'TRANSFER', 'REFUND'] as const;
export const TRANSACTION_STATUSES = ['COMPLETED', 'VOID', 'REVERSED'] as const;
export const ACCOUNT_TYPES = ['CASH', 'BANK', 'CARD', 'CLICK', 'PAYME', 'UZUM', 'OTHER'] as const;
export const CASH_FLOW_PERIODS = ['day', 'week', 'month'] as const;

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

function moneySchema(label: string) {
  return z.coerce
    .number(`${label} raqam bo‘lishi kerak`)
    .int(`${label} butun son bo‘lishi kerak`)
    .min(1, `${label} noldan katta bo‘lishi kerak`)
    .max(999_999_999, `${label} juda katta`);
}

export const transactionListQuerySchema = paginationQuerySchema.extend({
  type: z.enum(TRANSACTION_TYPES, 'Tur noto‘g‘ri').optional(),
  status: z.enum(TRANSACTION_STATUSES, 'Holat noto‘g‘ri').optional(),
  accountId: idSchema.optional(),
  entityType: z.string().trim().max(50).optional(),
  createdById: idSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sortBy: z.enum(['occurredAt', 'amount', 'number']).default('occurredAt'),
});

/** Moliyaviy panel va cash flow uchun sana oralig‘i */
export const financeRangeQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});

export const cashFlowQuerySchema = financeRangeQuerySchema.extend({
  period: z.enum(CASH_FLOW_PERIODS, 'Davr noto‘g‘ri').default('day'),
});

export const voidTransactionSchema = z.object({
  reason: z
    .string('Bekor qilish sababini yozing')
    .trim()
    .min(5, 'Sabab kamida 5 belgidan iborat bo‘lsin')
    .max(255, 'Sabab 255 belgidan oshmasligi kerak'),
});

export const accountSchema = z.object({
  key: z
    .string('Kalit kiriting')
    .trim()
    .min(2, 'Kamida 2 belgi')
    .max(50, 'Kalit juda uzun')
    .regex(/^[A-Z0-9_]+$/, 'Kalit faqat katta harf, raqam va pastki chiziqdan iborat bo‘lsin'),
  name: z.string('Nom kiriting').trim().min(2, 'Kamida 2 belgi').max(100, 'Nom juda uzun'),
  type: z.enum(ACCOUNT_TYPES, 'Hisob turini tanlang'),
  description: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateAccountSchema = accountSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** Kassalar o‘rtasida pul o‘tkazish */
export const transferSchema = z
  .object({
    fromAccountId: z.string('Hisobni tanlang').trim().min(1, 'Hisobni tanlang').max(50),
    toAccountId: z.string('Hisobni tanlang').trim().min(1, 'Hisobni tanlang').max(50),
    amount: moneySchema('Summa'),
    occurredAt: optionalField(dateOnlySchema),
    description: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    path: ['toAccountId'],
    message: 'Bir xil hisob tanlangan',
  });

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;
export type FinanceRangeQuery = z.infer<typeof financeRangeQuerySchema>;
export type CashFlowQuery = z.infer<typeof cashFlowQuerySchema>;
export type VoidTransactionInput = z.infer<typeof voidTransactionSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type CashFlowPeriod = (typeof CASH_FLOW_PERIODS)[number];
