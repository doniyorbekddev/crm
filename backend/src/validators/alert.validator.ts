import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const ALERT_TYPES = [
  'HIGH_DEBT',
  'LOW_ATTENDANCE',
  'HIGH_DROPOUT',
  'OVERDUE_FOLLOWUPS',
  'UNPAID_SALARY',
  'BUDGET_EXCEEDED',
  'LOW_GROUP_CAPACITY',
  'SALES_TARGET_ACHIEVED',
] as const;
export const ALERT_SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;
export const TARGET_TYPES = ['LEADS', 'SALES', 'REVENUE'] as const;

const yearSchema = z.coerce.number('Yil raqam bo‘lishi kerak').int().min(2020).max(2100);
const monthSchema = z.coerce.number('Oy raqam bo‘lishi kerak').int().min(1).max(12);

export const alertListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['open', 'resolved', 'all'], 'Holat noto‘g‘ri').default('open'),
  type: z.enum(ALERT_TYPES, 'Tur noto‘g‘ri').optional(),
  severity: z.enum(ALERT_SEVERITIES, 'Daraja noto‘g‘ri').optional(),
});

export const resolveAlertSchema = z.object({
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const targetQuerySchema = z.object({
  year: yearSchema.optional(),
  month: monthSchema.optional(),
});

export const saveTargetSchema = z.object({
  year: yearSchema,
  month: monthSchema,
  userId: z.string('Xodimni tanlang').trim().min(1, 'Xodimni tanlang').max(50),
  type: z.enum(TARGET_TYPES, 'Reja turini tanlang'),
  /** 0 — rejani olib tashlash */
  targetValue: z.coerce.number('Qiymat raqam bo‘lishi kerak').int('Butun son kiriting').min(0).max(999_999_999),
});

export type AlertListQuery = z.infer<typeof alertListQuerySchema>;
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
export type TargetQuery = z.infer<typeof targetQuerySchema>;
export type SaveTargetInput = z.infer<typeof saveTargetSchema>;
