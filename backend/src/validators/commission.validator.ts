import { z } from 'zod';
import { currentBusinessMonth } from '../utils/dates.js';
import { monthSchema, yearSchema } from './salary.validator.js';

/** Oy tanlanmasa — o‘quv markaz vaqti bo‘yicha joriy oy */
export const commissionQuerySchema = z.object({
  year: yearSchema.default(() => currentBusinessMonth().year),
  month: monthSchema.default(() => currentBusinessMonth().month),
});

export const teacherProfileParamSchema = z.object({
  teacherProfileId: z.string().trim().min(1).max(50),
});

export type CommissionQuery = z.infer<typeof commissionQuerySchema>;
