import { z } from 'zod';
import { emailSchema } from './common.validator.js';
import { httpUrlSchema } from './lesson.validator.js';

/** Ota-ona bir nechta farzandga ega bo'lishi mumkin — qaysi biri ko'rilayotgani */
export const portalChildQuerySchema = z.object({
  studentId: z.string().trim().min(1).max(50).optional(),
});

/** Davomat kalendari: oy ko'rsatilmasa — joriy oy (controllerda) */
export const portalCalendarQuerySchema = portalChildQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

/** Haftalik hisobot: `week` — hafta ichidagi istalgan sana (YYYY-MM-DD); bo'lmasa joriy hafta */
export const weeklyReportQuerySchema = portalChildQuerySchema.extend({
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD formatida bo‘lishi kerak')
    .optional(),
});

/** "Darsni o'rgandim" belgisi */
export const lessonCompleteSchema = z.object({ completed: z.boolean().default(true) });

/**
 * O'quvchi javobi: matn, havola, kod (TZ §18). Hammasi ixtiyoriy — fayl bilan ham topshirish mumkin;
 * "hech narsa yo'q" holati servisda tekshiriladi (saqlangan fayllar ham hisobga olinadi).
 */
export const portalHomeworkSubmitSchema = z.object({
  answerText: z.string().trim().max(2000, 'Javob 2000 belgidan oshmasin').optional(),
  linkUrl: z.preprocess((value) => (value === '' ? undefined : value), httpUrlSchema.optional()),
  codeText: z.string().max(20_000, 'Kod 20 000 belgidan oshmasin').optional(),
  codeLanguage: z.string().trim().max(30).optional(),
});

export const portalAccountSchema = z.object({
  email: emailSchema,
});

/** O'quvchi kabineti: email ixtiyoriy — bo'lmasa o'quvchi ID raqami (ST-000045) bilan kiradi */
export const studentPortalAccountSchema = z.object({
  email: z.preprocess((value) => (value === '' || value === null ? undefined : value), emailSchema.optional()),
});

/** Ommaviy ochish: aniq ro'yxat yoki guruh; ikkalasi ham bo'lmasa — doiradagi barcha faol o'quvchilar */
export const bulkPortalAccountsSchema = z.object({
  studentIds: z.array(z.string().trim().min(1).max(50)).min(1).max(300).optional(),
  groupId: z.string().trim().min(1).max(50).optional(),
});

export type BulkPortalAccountsInput = z.infer<typeof bulkPortalAccountsSchema>;

/** Ota-onalarga ommaviy ochish: aniq ro'yxat yoki farzandi o'qiydigan guruh */
export const bulkParentPortalAccountsSchema = bulkPortalAccountsSchema.extend({
  parentIds: z.array(z.string().trim().min(1).max(50)).min(1).max(300).optional(),
});

export type BulkParentPortalAccountsInput = z.infer<typeof bulkParentPortalAccountsSchema>;

export type PortalChildQuery = z.infer<typeof portalChildQuerySchema>;

/** Onlayn imtihon javobi (avtosaqlash): variant(lar) yoki matn/kod */
export const portalExamAnswerSchema = z.object({
  optionIds: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  text: z.string().max(20000, 'Javob juda uzun').nullable().optional(),
});
