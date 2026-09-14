import { z } from 'zod';
import { optionalField } from './common.validator.js';

/** Xodim hujjati turlari (chek — faqat xarajat va tushumga avtomatik beriladi) */
export const STAFF_DOCUMENT_CATEGORIES = ['CONTRACT', 'PASSPORT', 'CERTIFICATE', 'OTHER'] as const;

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2027-01-31')
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

const titleSchema = z.string().trim().max(150, 'Hujjat nomi 150 belgidan oshmasligi kerak');

/** Yuklashda so‘rov satrida: `?category=CONTRACT&title=...&expiresAt=2027-01-31` */
export const staffDocumentMetaSchema = z.object({
  category: z.enum(STAFF_DOCUMENT_CATEGORIES, 'Hujjat turini tanlang').default('OTHER'),
  title: optionalField(titleSchema),
  expiresAt: optionalField(dateOnlySchema),
});

/** Faqat yuborilgan maydonlar o‘zgaradi; bo‘sh satr yoki null — qiymatni tozalash */
export const updateDocumentSchema = z
  .object({
    category: z.enum(STAFF_DOCUMENT_CATEGORIES, 'Hujjat turini tanlang').optional(),
    title: z.preprocess((value) => (value === '' ? null : value), titleSchema.nullable()).optional(),
    expiresAt: z.preprocess((value) => (value === '' ? null : value), dateOnlySchema.nullable()).optional(),
  })
  .refine((values) => Object.values(values).some((value) => value !== undefined), 'Kamida bitta maydonni o‘zgartiring');

export type StaffDocumentMeta = z.infer<typeof staffDocumentMetaSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
