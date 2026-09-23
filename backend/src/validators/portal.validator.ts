import { z } from 'zod';
import { emailSchema } from './common.validator.js';

/** Ota-ona bir nechta farzandga ega bo'lishi mumkin — qaysi biri ko'rilayotgani */
export const portalChildQuerySchema = z.object({
  studentId: z.string().trim().min(1).max(50).optional(),
});

export const portalAccountSchema = z.object({
  email: emailSchema,
});

export type PortalChildQuery = z.infer<typeof portalChildQuerySchema>;
