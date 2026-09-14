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
  'CONVERSION_DROP',
  'DROPOUT_INCREASE',
  'CASH_SHORTAGE',
  'PENDING_EXPENSE_APPROVAL',
  'DOCUMENT_EXPIRING',
] as const;
export const ALERT_SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'CRITICAL'] as const;
export const TARGET_TYPES = ['LEADS', 'SALES', 'REVENUE'] as const;

const yearSchema = z.coerce.number('Yil raqam bo‘lishi kerak').int().min(2020).max(2100);
const monthSchema = z.coerce.number('Oy raqam bo‘lishi kerak').int().min(1).max(12);

export const alertListQuerySchema = paginationQuerySchema.extend({
  /** unread — ochiq va hali hech kim o‘qimagan */
  status: z.enum(['open', 'unread', 'resolved', 'all'], 'Holat noto‘g‘ri').default('open'),
  type: z.enum(ALERT_TYPES, 'Tur noto‘g‘ri').optional(),
  severity: z.enum(ALERT_SEVERITIES, 'Daraja noto‘g‘ri').optional(),
});

export const resolveAlertSchema = z.object({
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

function intRange(label: string, min: number, max: number) {
  return z.coerce
    .number(`${label} raqam bo‘lishi kerak`)
    .int(`${label} butun son bo‘lishi kerak`)
    .min(min, `${label}: kamida ${min}`)
    .max(max, `${label}: ko‘pi bilan ${max}`);
}

/** Faqat yuborilgan maydonlar o‘zgaradi; qolganlari saqlangan (yoki standart) qiymatda qoladi */
export const alertSettingsSchema = z.object({
  rules: z.partialRecord(z.enum(ALERT_TYPES, 'Tur noto‘g‘ri'), z.boolean('Yoqilgan yoki o‘chirilgan bo‘lsin')).optional(),
  debtSharePercent: intRange('Qarz ulushi', 10, 100).optional(),
  debtGraceDays: intRange('Qarz uchun kutish', 0, 180).optional(),
  dropoutAbsences: intRange('Qoldirilgan darslar', 2, 10).optional(),
  attendanceWarning: intRange('Past davomat', 10, 100).optional(),
  attendanceCritical: intRange('Juda past davomat', 0, 100).optional(),
  followUpWarning: intRange('Kechikkan follow-up', 1, 100).optional(),
  followUpCritical: intRange('Juda ko‘p kechikkan follow-up', 1, 500).optional(),
  salaryGraceDays: intRange('Maosh kechikishi', 0, 60).optional(),
  capacityPercent: intRange('Guruh to‘lganligi', 5, 100).optional(),
  conversionDropPoints: intRange('Konversiya tushishi', 1, 100).optional(),
  dropoutIncreasePercent: intRange('Ketishlar o‘sishi', 1, 1000).optional(),
  dropoutIncreaseMin: intRange('Ketganlar soni', 1, 100).optional(),
  expenseApprovalDays: intRange('Tasdiq kutish', 1, 60).optional(),
  documentExpiryDays: intRange('Hujjat muddati', 1, 180).optional(),
  digestEnabled: z.boolean('Yoqilgan yoki o‘chirilgan bo‘lsin').optional(),
  digestHour: intRange('Kunlik xulosa soati', 0, 23).optional(),
});

export const digestQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01')
    .optional(),
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
export type AlertSettingsInput = z.infer<typeof alertSettingsSchema>;
export type DigestQuery = z.infer<typeof digestQuerySchema>;
export type TargetQuery = z.infer<typeof targetQuerySchema>;
export type SaveTargetInput = z.infer<typeof saveTargetSchema>;
