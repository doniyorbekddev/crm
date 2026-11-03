import type { Request, Response } from 'express';
import { branchScopeOf } from '../services/branchScope.js';
import { financialPeriodService } from '../services/financialPeriod.service.js';
import { monthSnapshotService } from '../services/monthSnapshot.service.js';
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

  async lock(req: Request, res: Response): Promise<void> {
    const input = reopenPeriodSchema.parse(req.body);
    sendSuccess(res, await financialPeriodService.lock(requireAuthUser(req), input, getClientInfo(req)), { message: 'Moliyaviy oy qulflandi' });
  },

  async unlock(req: Request, res: Response): Promise<void> {
    const input = reopenPeriodSchema.parse(req.body);
    sendSuccess(res, await financialPeriodService.unlock(requireAuthUser(req), input, getClientInfo(req)), { message: 'Moliyaviy oy qulfi ochildi' });
  },

  async snapshot(req: Request, res: Response): Promise<void> {
    const input = closePeriodSchema.parse(req.query);
    sendSuccess(res, await monthSnapshotService.summary(input.year, input.month, await branchScopeOf(requireAuthUser(req))));
  },

  async generateSnapshot(req: Request, res: Response): Promise<void> {
    const input = closePeriodSchema.parse(req.body);
    sendSuccess(res, await monthSnapshotService.generate(requireAuthUser(req), input.year, input.month, getClientInfo(req)), {
      message: 'Oy oxiri snapshoti to‘ldirildi',
    });
  },
};
