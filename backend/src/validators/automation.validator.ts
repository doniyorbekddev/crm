import { z } from 'zod';
import { optionalField, paginationQuerySchema } from './common.validator.js';

export const AUTOMATION_AUDIENCES = ['STAFF', 'RESPONSIBLE', 'STUDENT', 'PARENT'] as const;

export const automationUpdateSchema = z.object({
  isActive: z.boolean().optional(),
  audience: z.enum(AUTOMATION_AUDIENCES).optional(),
  /** Qoida parametrlari — faqat musbat butun sonlar (masalan {absences: 2}) */
  params: z.record(z.string().max(30), z.coerce.number().int().min(0).max(365)).optional(),
});

export const automationRunQuerySchema = paginationQuerySchema.omit({ search: true }).extend({
  ruleKey: optionalField(z.string().trim().max(50)),
});

export type AutomationUpdateInput = z.infer<typeof automationUpdateSchema>;
export type AutomationRunQuery = z.infer<typeof automationRunQuerySchema>;
