import type { Request, Response } from 'express';
import { salaryService } from '../services/salary.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  adjustSalarySchema,
  calculateSalarySchema,
  createAdjustmentSchema,
  paySalarySchema,
  reasonSchema,
  salaryPeriodListQuerySchema,
} from '../validators/salary.validator.js';

export const salaryController = {
  async periods(req: Request, res: Response): Promise<void> {
    const query = salaryPeriodListQuerySchema.parse(req.query);
    sendSuccess(res, await salaryService.periods(query));
  },

  async summary(req: Request, res: Response): Promise<void> {
    const query = salaryPeriodListQuerySchema.parse(req.query);
    sendSuccess(res, await salaryService.summary(query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await salaryService.periodById(id));
  },

  async calculate(req: Request, res: Response): Promise<void> {
    const input = calculateSalarySchema.parse(req.body);
    const result = await salaryService.calculate(requireAuthUser(req), input, getClientInfo(req));
    sendSuccess(res, result, {
      message:
        result.calculated === 0
          ? 'Hisoblash uchun mos o‘qituvchi topilmadi'
          : `${result.calculated} ta o‘qituvchi maoshi hisoblandi`,
    });
  },

  async adjust(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = adjustSalarySchema.parse(req.body);
    sendSuccess(res, await salaryService.adjust(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Izoh saqlandi',
    });
  },

  async approve(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await salaryService.approve(requireAuthUser(req), id, getClientInfo(req)), {
      message: 'Maosh tasdiqlandi',
    });
  },

  async pay(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = paySalarySchema.parse(req.body);
    sendSuccess(res, await salaryService.pay(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: input.kind === 'ADVANCE' ? 'Avans qayd etildi' : 'Maosh to‘lovi qayd etildi',
    });
  },

  async addAdjustment(req: Request, res: Response): Promise<void> {
    const input = createAdjustmentSchema.parse(req.body);
    sendCreated(
      res,
      await salaryService.addAdjustment(requireAuthUser(req), input, getClientInfo(req)),
      input.type === 'BONUS' ? 'Bonus qo‘shildi' : 'Jarima qo‘shildi',
    );
  },

  async voidAdjustment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = reasonSchema.parse(req.body);
    sendSuccess(res, await salaryService.voidAdjustment(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Yozuv bekor qilindi',
    });
  },

  async unlock(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = reasonSchema.parse(req.body);
    sendSuccess(res, await salaryService.unlock(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Maosh qayta ochildi',
    });
  },
};
