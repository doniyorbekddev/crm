import type { Request, Response } from 'express';
import { z } from 'zod';
import { teachingService } from '../services/teaching.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';

const overviewQuerySchema = z.object({ teacherId: z.string().trim().min(1).max(50).optional() });

export const teachingController = {
  async overview(req: Request, res: Response): Promise<void> {
    const query = overviewQuerySchema.parse(req.query);
    sendSuccess(res, await teachingService.overview(requireAuthUser(req), query));
  },

  async group(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await teachingService.group(requireAuthUser(req), id));
  },
};
