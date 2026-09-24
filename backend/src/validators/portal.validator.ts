import { z } from 'zod';
import { emailSchema } from './common.validator.js';

/** Ota-ona bir nechta farzandga ega bo'lishi mumkin — qaysi biri ko'rilayotgani */
export const portalChildQuerySchema = z.object({
  studentId: z.string().trim().min(1).max(50).optional(),
});

/** Davomat kalendari: oy ko'rsatilmasa — joriy oy (controllerda) */
export const portalCalendarQuerySchema = portalChildQuerySchema.extend({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

/** O'quvchining matnli javobi */
export const portalHomeworkSubmitSchema = z.object({
  answerText: z.string().trim().min(1, 'Javobni kiriting').max(2000, 'Javob 2000 belgidan oshmasin'),
});

export const portalAccountSchema = z.object({
  email: emailSchema,
});

export type PortalChildQuery = z.infer<typeof portalChildQuerySchema>;
