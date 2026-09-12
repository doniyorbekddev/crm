import { z } from 'zod';
import { paginationQuerySchema } from './common.validator.js';

const idSchema = z.string().trim().min(1).max(50);

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

export const auditListQuerySchema = paginationQuerySchema
  .extend({
    userId: idSchema.optional(),
    action: z.string().trim().max(100).optional(),
    entityType: z.string().trim().max(50).optional(),
    entityId: idSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Faqat muhim amallar (o‘chirish, ruxsat o‘zgarishi, shubhali kirish) */
    criticalOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .refine((values) => !values.from || !values.to || values.from <= values.to, {
    path: ['to'],
    message: 'Tugash sanasi boshlanish sanasidan oldin bo‘lmasligi kerak',
  });

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
