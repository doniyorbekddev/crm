import type { Request, Response } from 'express';
import { commissionService } from '../services/commission.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { commissionQuerySchema, teacherProfileParamSchema } from '../validators/commission.validator.js';

export const commissionController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await commissionService.list(commissionQuerySchema.parse(req.query)));
  },

  async detail(req: Request, res: Response): Promise<void> {
    const { teacherProfileId } = teacherProfileParamSchema.parse(req.params);
    sendSuccess(res, await commissionService.detail(teacherProfileId, commissionQuerySchema.parse(req.query)));
  },

  async mine(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await commissionService.mine(requireAuthUser(req).id, commissionQuerySchema.parse(req.query)));
  },
};
