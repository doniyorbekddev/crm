import { z } from 'zod';

export const ACTIVITY_TYPES = ['student', 'payment', 'expense', 'lead', 'attendance', 'teaching', 'salary'] as const;

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

export const activityQuerySchema = z
  .object({
    /** Vergul bilan: `payment,expense`; berilmasa — ruxsat berilgan barcha turlar */
    types: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined))
      .pipe(z.array(z.enum(ACTIVITY_TYPES, 'Faoliyat turi noto‘g‘ri')).optional()),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Oldingi sahifaning `nextCursor` qiymati (ISO vaqt) */
    cursor: z
      .string()
      .trim()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Kursor noto‘g‘ri')
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .refine((values) => !values.from || !values.to || values.from <= values.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
