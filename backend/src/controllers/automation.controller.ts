import type { Request, Response } from 'express';
import { automationService } from '../services/automation.service.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { automationRunQuerySchema, automationUpdateSchema } from '../validators/automation.validator.js';
import { z } from 'zod';

const keyParamSchema = z.object({ key: z.string().trim().min(2).max(50) });

export const automationController = {
  async list(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await automationService.list());
  },

  async runs(req: Request, res: Response): Promise<void> {
    const query = automationRunQuerySchema.parse(req.query);
    const { items, total } = await automationService.runs(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { key } = keyParamSchema.parse(req.params);
    const input = automationUpdateSchema.parse(req.body);
    sendSuccess(res, await automationService.update(requireAuthUser(req), key, input, getClientInfo(req)), {
      message: 'Qoida saqlandi',
    });
  },

  /** Qo‘lda ishga tushirish — sozlamani o‘zgartirgandan keyin darhol tekshirish uchun */
  async run(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await automationService.runAll(), { message: 'Qoidalar ishga tushirildi' });
  },
};
