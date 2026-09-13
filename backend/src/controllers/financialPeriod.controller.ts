import type { Request, Response } from 'express';
import { financialPeriodService } from '../services/financialPeriod.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { closePeriodSchema, periodListQuerySchema, reopenPeriodSchema } from '../validators/finance.validator.js';

export const financialPeriodController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await financialPeriodService.list(periodListQuerySchema.parse(req.query)));
  },

  async close(req: Request, res: Response): Promise<void> {
    const input = closePeriodSchema.parse(req.body);
    sendSuccess(res, await financialPeriodService.close(requireAuthUser(req), input, getClientInfo(req)), { message: 'Moliyaviy oy yopildi' });
  },

  async reopen(req: Request, res: Response): Promise<void> {
    const input = reopenPeriodSchema.parse(req.body);
    sendSuccess(res, await financialPeriodService.reopen(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Moliyaviy oy qayta ochildi',
    });
  },
};
