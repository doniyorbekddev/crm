import { z } from 'zod';

export const REPORT_TYPES = [
  'sales',
  'managers',
  'courses',
  'groups',
  'payments',
  'debts',
  'attendance',
  'sources',
] as const;

export const GROUP_BY_OPTIONS = ['day', 'week', 'month'] as const;

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

const idSchema = z.string().trim().min(1).max(50);

export const reportTypeParamSchema = z.object({
  type: z.enum(REPORT_TYPES, 'Bunday hisobot turi yo‘q'),
});

export const reportQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Faqat vaqt kesimidagi hisobotlar uchun (sales, payments) */
    groupBy: z.enum(GROUP_BY_OPTIONS, 'Guruhlash noto‘g‘ri').default('day'),
    courseId: idSchema.optional(),
    groupId: idSchema.optional(),
    managerId: idSchema.optional(),
  })
  .refine((values) => !values.from || !values.to || values.from <= values.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

export const reportExportQuerySchema = z.object({ format: z.enum(['csv'], 'Faqat CSV formati qo‘llab-quvvatlanadi').default('csv') });

export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportGroupBy = (typeof GROUP_BY_OPTIONS)[number];
export type ReportQuery = z.infer<typeof reportQuerySchema>;
