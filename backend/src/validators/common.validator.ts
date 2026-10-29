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

/** Ma'lumotnoma yozuvi nomi (manba, turkum…): bo'shliqlar yig'iladi */
export const dictionaryEntryNameSchema = z
  .string('Nomini kiriting')
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'Nom kamida 2 belgi').max(100, 'Nom 100 belgidan oshmasin'));

/**
 * "Boshqa" tanlanganda markaz o'zi yozadigan nom ("Buvi", "Robototexnika"): bo'shliqlar yig'iladi, bo'sh — yo'q.
 * Enum `OTHER` bo'lmasa servis uni saqlamaydi (`customLabelFor`).
 */
export function customLabelField(max: number) {
  return optionalField(
    z
      .string()
      .transform((value) => value.trim().replace(/\s+/g, ' '))
      .pipe(z.string().min(2, 'Nom kamida 2 belgi').max(max, `Nom ${max} belgidan oshmasin`)),
  );
}

/** Erkin nom faqat "Boshqa" bilan birga ma'noli; boshqa qiymatda eski nom qolib ketmasin */
export function customLabelFor(code: string, label: string | undefined): string | null {
  return code === 'OTHER' ? (label ?? null) : null;
}

/** Eksport formati: `?format=csv` (standart) yoki `?format=xlsx` */
export const exportFormatSchema = z.enum(EXPORT_FORMATS, 'Format: csv yoki xlsx').default('csv');
