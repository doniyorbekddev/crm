import type { Request, Response } from 'express';
import { z } from 'zod';
import { ACADEMIC_DIMENSIONS, academicAnalyticsService } from '../services/academicAnalytics.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';

const dateOnly = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana formati: 2026-10-01');

export const academicQuerySchema = z.object({
  dimension: z.enum(ACADEMIC_DIMENSIONS, 'Kesim noto‘g‘ri').default('course'),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  courseId: z.string().trim().min(1).max(50).optional(),
  groupId: z.string().trim().min(1).max(50).optional(),
});

export const academicAnalyticsController = {
  async build(req: Request, res: Response): Promise<void> {
    const query = academicQuerySchema.parse(req.query);
    sendSuccess(res, await academicAnalyticsService.build(requireAuthUser(req), query));
  },
};
