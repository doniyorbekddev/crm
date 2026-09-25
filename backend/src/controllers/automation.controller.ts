import type { Request, Response } from 'express';
import { automationService } from '../services/automation.service.js';
import { builderRuleSchema } from '../services/automationBuilder.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
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

  /** TZ §51: yangi maxsus qoida */
  async create(req: Request, res: Response): Promise<void> {
    const input = builderRuleSchema.parse(req.body);
    sendCreated(res, await automationService.create(requireAuthUser(req), input, getClientInfo(req)), 'Qoida yaratildi');
  },

  async updateCustom(req: Request, res: Response): Promise<void> {
    const { key } = keyParamSchema.parse(req.params);
    const input = builderRuleSchema.parse(req.body);
    sendSuccess(res, await automationService.updateCustom(requireAuthUser(req), key, input, getClientInfo(req)), { message: 'Qoida saqlandi' });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { key } = keyParamSchema.parse(req.params);
    await automationService.remove(requireAuthUser(req), key, getClientInfo(req));
    sendSuccess(res, null, { message: 'Qoida o‘chirildi' });
  },

  /** Sinov: nechta holat mos keladi (amal bajarilmaydi) */
  async test(req: Request, res: Response): Promise<void> {
    const input = builderRuleSchema.pick({ trigger: true, conditions: true }).parse(req.body);
    sendSuccess(res, await automationService.test(input));
  },

  /** Qo‘lda ishga tushirish — sozlamani o‘zgartirgandan keyin darhol tekshirish uchun */
  async run(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await automationService.runAll(), { message: 'Qoidalar ishga tushirildi' });
  },
};
