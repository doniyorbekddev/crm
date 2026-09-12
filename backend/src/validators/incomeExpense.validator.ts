import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';
import { PAYMENT_METHODS } from './payment.validator.js';

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

const amountSchema = z.coerce
  .number('Summa raqam bo‘lishi kerak')
  .int('Summa butun son bo‘lishi kerak')
  .min(1000, 'Eng kam summa — 1 000 so‘m')
  .max(999_999_999, 'Summa juda katta');

export const moneyListQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  accountId: idSchema.optional(),
  method: z.enum(PAYMENT_METHODS, 'To‘lov usuli noto‘g‘ri').optional(),
  responsibleId: idSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  sortBy: z.enum(['date', 'amount', 'number']).default('date'),
});

const moneyFieldsSchema = z.object({
  categoryId: z.string('Kategoriyani tanlang').trim().min(1, 'Kategoriyani tanlang').max(50),
  amount: amountSchema,
  method: z.enum(PAYMENT_METHODS, 'To‘lov usulini tanlang').default('CASH'),
  accountId: optionalField(idSchema),
  date: optionalField(dateOnlySchema),
  description: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const createIncomeSchema = moneyFieldsSchema.extend({
  /** Tushum o‘quvchiga bog‘liq bo‘lsa (kitob, forma va h.k.) */
  studentId: optionalField(idSchema),
});

/** Ilova (chek) fayli keyingi bosqichda hujjatlar moduli orqali yuklanadi — mijozdan erkin yo‘l qabul qilinmaydi */
export const createExpenseSchema = moneyFieldsSchema;

export const voidMoneySchema = z.object({
  reason: z
    .string('Bekor qilish sababini yozing')
    .trim()
    .min(5, 'Sabab kamida 5 belgidan iborat bo‘lsin')
    .max(255, 'Sabab 255 belgidan oshmasligi kerak'),
});

export const categorySchema = z.object({
  key: z
    .string('Kalit kiriting')
    .trim()
    .min(2, 'Kamida 2 belgi')
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Kalit faqat katta harf, raqam va pastki chiziqdan iborat bo‘lsin'),
  name: z.string('Nom kiriting').trim().min(2, 'Kamida 2 belgi').max(100, 'Nom juda uzun'),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Kamida 2 belgi').max(100).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const budgetQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const saveBudgetSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  note: optionalField(z.string().trim().max(255)),
  lines: z
    .array(
      z.object({
        categoryId: z.string().trim().min(1).max(50),
        plannedAmount: z.coerce.number().int().min(0).max(999_999_999),
      }),
      'Budjet qatorlarini kiriting',
    )
    .max(50, 'Juda ko‘p qator'),
});

export type MoneyListQuery = z.infer<typeof moneyListQuerySchema>;
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type VoidMoneyInput = z.infer<typeof voidMoneySchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;
export type SaveBudgetInput = z.infer<typeof saveBudgetSchema>;
