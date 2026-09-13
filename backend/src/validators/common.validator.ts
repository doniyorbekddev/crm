import { z } from 'zod';
import { EXPORT_FORMATS } from '../utils/tableExport.js';

/** "+998 90 123-45-67", "901234567", "998901234567" → "+998901234567" */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 9) return `+998${digits}`;
  return `+${digits}`;
}

export const phoneSchema = z
  .string('Telefon raqam kiritilishi shart')
  .trim()
  .min(1, 'Telefon raqam kiritilishi shart')
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\+\d{9,15}$/, 'Telefon raqam noto‘g‘ri (masalan: +998901234567)'));

export const emailSchema = z
  .string('Email kiritilishi shart')
  .trim()
  .toLowerCase()
  .min(1, 'Email kiritilishi shart')
  .max(255, 'Email juda uzun')
  .pipe(z.email('Email noto‘g‘ri formatda'));

export function nameSchema(label: string) {
  return z
    .string(`${label} kiritilishi shart`)
    .trim()
    .min(2, `${label} kamida 2 belgidan iborat bo‘lishi kerak`)
    .max(100, `${label} 100 belgidan oshmasligi kerak`);
}

export const idParamSchema = z.object({
  id: z.string().trim().min(1, 'ID noto‘g‘ri').max(50, 'ID noto‘g‘ri'),
});

/** Barcha ro‘yxat endpointlari uchun umumiy query parametrlari. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number('Sahifa raqami noto‘g‘ri').int().min(1).default(1),
  limit: z.coerce.number('Limit noto‘g‘ri').int().min(1).max(100, 'Limit 100 dan oshmasligi kerak').default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Qidiruv matni juda uzun')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Formadan kelgan bo‘sh qator yoki null → undefined (ixtiyoriy maydonlar uchun). */
export function optionalField<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());
}

/** Eksport formati: `?format=csv` (standart) yoki `?format=xlsx` */
export const exportFormatSchema = z.enum(EXPORT_FORMATS, 'Format: csv yoki xlsx').default('csv');
