import type { Request, Response } from 'express';
import { paymentScheduleService } from '../services/paymentSchedule.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { generateScheduleSchema, replaceScheduleSchema } from '../validators/paymentSchedule.validator.js';

export const paymentScheduleController = {
  async get(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await paymentScheduleService.get(id));
  },

  async generate(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = generateScheduleSchema.parse(req.body);
    sendSuccess(res, await paymentScheduleService.generate(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'To‘lov jadvali tuzildi',
    });
  },

  async replace(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = replaceScheduleSchema.parse(req.body);
    sendSuccess(res, await paymentScheduleService.replace(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'To‘lov jadvali saqlandi',
    });
  },
};
