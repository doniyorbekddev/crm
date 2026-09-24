import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const PAYMENT_PROVIDERS = ['CLICK', 'PAYME', 'UZUM', 'SANDBOX'] as const;
export const PAYMENT_INTENT_STATUSES = ['PENDING', 'PAID', 'CANCELLED', 'FAILED', 'REFUNDED'] as const;

export const createIntentSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS, 'Provayderni tanlang'),
  studentId: idSchema,
  amount: z.coerce.number().int().min(1000, 'Eng kam to‘lov — 1 000 so‘m').max(999_999_999, 'Summa juda katta'),
  /** Provayder raqami oldindan ma’lum bo‘lsa */
  externalId: optionalField(z.string().trim().max(120)),
});

export const intentListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  status: z.enum(PAYMENT_INTENT_STATUSES).optional(),
  studentId: optionalField(idSchema),
});

export const webhookParamsSchema = z.object({
  provider: z.string().trim().min(3).max(20),
});

export type CreateIntentInput = z.infer<typeof createIntentSchema>;
export type IntentListQuery = z.infer<typeof intentListQuerySchema>;
