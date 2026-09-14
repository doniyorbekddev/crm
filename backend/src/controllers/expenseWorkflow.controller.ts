import type { Request, Response } from 'express';
import { expenseService } from '../services/incomeExpense.service.js';
import { expenseWorkflowService } from '../services/expenseWorkflow.service.js';
import { recurringExpenseService } from '../services/recurringExpense.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  expenseSettingsSchema,
  payExpenseSchema,
  recurringExpenseSchema,
  updateRecurringExpenseSchema,
  voidMoneySchema,
} from '../validators/incomeExpense.validator.js';

export const expenseWorkflowController = {
  async settings(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await expenseWorkflowService.settings());
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const input = expenseSettingsSchema.parse(req.body);
    sendSuccess(res, await expenseWorkflowService.updateSettings(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Tasdiq chegarasi saqlandi',
    });
  },

  async approve(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await expenseWorkflowService.approve(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, await expenseService.getById(id), { message: 'Xarajat tasdiqlandi' });
  },

  async reject(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = voidMoneySchema.parse(req.body);
    await expenseWorkflowService.reject(requireAuthUser(req), id, input, getClientInfo(req));
    sendSuccess(res, await expenseService.getById(id), { message: 'Xarajat rad etildi' });
  },

  async pay(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = payExpenseSchema.parse(req.body);
    await expenseWorkflowService.pay(requireAuthUser(req), id, input, getClientInfo(req));
    sendSuccess(res, await expenseService.getById(id), { message: 'Xarajat to‘landi' });
  },
};

export const recurringExpenseController = {
  async list(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await recurringExpenseService.list());
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = recurringExpenseSchema.parse(req.body);
    sendCreated(res, await recurringExpenseService.create(requireAuthUser(req), input, getClientInfo(req)), 'Takroriy xarajat qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateRecurringExpenseSchema.parse(req.body);
    sendSuccess(res, await recurringExpenseService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Saqlandi' });
  },

  async generate(req: Request, res: Response): Promise<void> {
    const result = await recurringExpenseService.generate(new Date(), requireAuthUser(req).id);
    sendSuccess(res, result, {
      message: result.created > 0 ? `${result.created} ta kutilayotgan xarajat yaratildi` : 'Bu oy uchun yangi xarajat yo‘q',
    });
  },
};
