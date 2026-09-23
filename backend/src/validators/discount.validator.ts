import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

export const DISCOUNT_TYPES = ['FAMILY', 'REFERRAL', 'PROMO_CODE', 'PREPAY_3', 'PREPAY_6', 'FIRST_PAYMENT', 'CUSTOM'] as const;
export const DISCOUNT_VALUE_TYPES = ['PERCENT', 'AMOUNT'] as const;
export const REFERRAL_STATUSES = ['PENDING', 'CONVERTED', 'REWARDED', 'CANCELLED'] as const;

export const discountSettingsSchema = z.object({
  maxPercent: z.coerce.number().int().min(0, 'Foiz manfiy bo‘lmaydi').max(100, 'Foiz 100 dan oshmasin'),
  allowStacking: z.boolean(),
});

export const discountRuleSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2, 'Kalit juda qisqa')
    .max(50, 'Kalit juda uzun')
    .regex(/^[a-z0-9_]+$/, 'Kalit faqat kichik harf, raqam va pastki chiziqdan iborat bo‘lsin'),
  name: z.string().trim().min(2, 'Nom juda qisqa').max(120, 'Nom juda uzun'),
  type: z.enum(DISCOUNT_TYPES, 'Chegirma turi noto‘g‘ri'),
  valueType: z.enum(DISCOUNT_VALUE_TYPES).default('PERCENT'),
  value: z.coerce.number().min(0, 'Qiymat manfiy bo‘lmaydi').max(1_000_000_000, 'Qiymat juda katta'),
  stackable: z.boolean().default(true),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  description: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const promoCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Kod juda qisqa')
    .max(32, 'Kod juda uzun')
    .regex(/^[A-Za-z0-9_-]+$/, 'Kodda faqat harf, raqam, - va _ ishlatiladi'),
  ruleKey: z.string().trim().min(2).max(50),
  /** 0 — cheksiz */
  usageLimit: z.coerce.number().int().min(0).max(10_000).default(0),
  expiresAt: z.coerce.date().optional(),
  note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
});

export const promoCodeActiveSchema = z.object({ isActive: z.boolean() });

export const grantDiscountSchema = z
  .object({
    ruleKey: optionalField(z.string().trim().max(50)),
    promoCode: optionalField(z.string().trim().max(32)),
    valueType: z.enum(DISCOUNT_VALUE_TYPES).optional(),
    value: z.coerce.number().min(0).max(1_000_000_000).optional(),
    label: optionalField(z.string().trim().max(120, 'Nom juda uzun')),
    note: optionalField(z.string().trim().max(255, 'Izoh juda uzun')),
  })
  .refine((values) => Boolean(values.ruleKey || values.promoCode || (values.valueType && values.value !== undefined)), {
    message: 'Qoida, promo kod yoki qiymat ko‘rsatilsin',
    path: ['ruleKey'],
  });

export const revokeDiscountSchema = z.object({
  reason: z.string('Sabab kiritilishi shart').trim().min(3, 'Sabab juda qisqa').max(255, 'Sabab juda uzun'),
});

export const discountRuleQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const referralListQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  status: z.enum(REFERRAL_STATUSES).optional(),
  studentId: optionalField(idSchema),
});

export const referralCodeQuerySchema = z.object({ code: z.string().trim().min(1).max(16) });

export const cancelReferralSchema = revokeDiscountSchema;

export type DiscountSettingsInput = z.infer<typeof discountSettingsSchema>;
export type DiscountRuleInput = z.infer<typeof discountRuleSchema>;
export type PromoCodeInput = z.infer<typeof promoCodeSchema>;
export type GrantDiscountInputSchema = z.infer<typeof grantDiscountSchema>;
export type ReferralListQuery = z.infer<typeof referralListQuerySchema>;
