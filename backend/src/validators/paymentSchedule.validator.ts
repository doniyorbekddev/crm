import { z } from 'zod';
import { MAX_INSTALLMENTS, isValidDateOnly } from '../utils/paymentSchedule.js';
import { optionalField } from './common.validator.js';

const dueDateSchema = z.string('Sanani kiriting').trim().refine(isValidDateOnly, 'Sana noto‘g‘ri (format: 2026-10-01)');

export const DEBT_DUE_FILTERS = ['all', 'overdue', 'upcoming'] as const;

/** Shartnoma summasidan oylik teng qismlar */
export const generateScheduleSchema = z.object({
  count: z.coerce
    .number('Qismlar soni raqam bo‘lishi kerak')
    .int('Qismlar soni butun son bo‘lishi kerak')
    .min(1, 'Kamida 1 ta qism')
    .max(MAX_INSTALLMENTS, `Ko‘pi bilan ${MAX_INSTALLMENTS} ta qism`),
  firstDueDate: dueDateSchema,
});

/** Jadvalni qo‘lda tuzish: qismlar yig‘indisi shartnoma summasiga teng bo‘lishi servisda tekshiriladi */
export const replaceScheduleSchema = z.object({
  installments: z
    .array(
      z.object({
        dueDate: dueDateSchema,
        amount: z.coerce
          .number('Summa raqam bo‘lishi kerak')
          .int('Summa butun son bo‘lishi kerak')
          .min(1000, 'Eng kam qism — 1 000 so‘m')
          .max(999_999_999, 'Summa juda katta'),
        note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
      }),
      'Qismlarni kiriting',
    )
    .min(1, 'Kamida bitta qism')
    .max(MAX_INSTALLMENTS, `Ko‘pi bilan ${MAX_INSTALLMENTS} ta qism`)
    .refine(
      (items) => items.every((item, index) => index === 0 || (items[index - 1]?.dueDate ?? '') <= item.dueDate),
      'Muddatlar o‘sib boruvchi tartibda bo‘lsin',
    ),
});

export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
export type ReplaceScheduleInput = z.infer<typeof replaceScheduleSchema>;
export type DebtDueFilter = (typeof DEBT_DUE_FILTERS)[number];
