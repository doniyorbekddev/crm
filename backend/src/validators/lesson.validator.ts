import { z } from 'zod';
import { optionalField } from './common.validator.js';

export const LESSON_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/** Faqat http(s) havolalar — `javascript:` kabi sxemalar rad etiladi */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(1000, 'Havola juda uzun')
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }, 'Havola http:// yoki https:// bilan boshlanishi kerak');

const lessonFieldsSchema = z.object({
  title: z.string('Dars nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(200, 'Nom juda uzun'),
  description: optionalField(z.string().trim().max(1000, 'Tavsif juda uzun')),
  content: optionalField(z.string().trim().max(50_000, 'Matn juda uzun')),
  teacherId: optionalField(z.string().trim().min(1).max(50)),
  durationMinutes: optionalField(z.coerce.number().int().min(1, 'Kamida 1 daqiqa').max(600, 'Ko‘pi bilan 600 daqiqa')),
  videoUrl: optionalField(httpUrlSchema.pipe(z.string().max(500, 'Havola juda uzun'))),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  status: z.enum(LESSON_STATUSES, 'Holat noto‘g‘ri').optional(),
});

export const createLessonSchema = lessonFieldsSchema;
/** Tahrirlashda `null` — maydonni tozalash */
export const updateLessonSchema = lessonFieldsSchema.partial().extend({
  description: z.string().trim().max(1000).nullable().optional(),
  content: z.string().trim().max(50_000).nullable().optional(),
  teacherId: z.string().trim().min(1).max(50).nullable().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600).nullable().optional(),
  videoUrl: httpUrlSchema.pipe(z.string().max(500)).nullable().optional(),
});

export const lessonLinkMaterialSchema = z.object({
  kind: z.enum(['LINK', 'VIDEO'], 'Turi noto‘g‘ri'),
  title: z.string('Nomi kiritilishi shart').trim().min(2, 'Kamida 2 belgi').max(200, 'Nom juda uzun'),
  url: httpUrlSchema,
});

export const lessonListQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
export type LessonLinkMaterialInput = z.infer<typeof lessonLinkMaterialSchema>;
