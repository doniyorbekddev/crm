import type { Request, Response } from 'express';
import { debtService } from '../services/debt.service.js';
import { paymentService } from '../services/payment.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createPaymentSchema,
  debtListQuerySchema,
  deletePaymentSchema,
  paymentListQuerySchema,
  paymentStatsQuerySchema,
} from '../validators/payment.validator.js';

export const paymentController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = paymentListQuerySchema.parse(req.query);
    const { items, total } = await paymentService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const query = paymentStatsQuerySchema.parse(req.query);
    sendSuccess(res, await paymentService.stats(query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await paymentService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createPaymentSchema.parse(req.body);
    sendCreated(res, await paymentService.create(requireAuthUser(req), input, getClientInfo(req)), 'To‘lov qabul qilindi');
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = deletePaymentSchema.parse(req.body);
    sendSuccess(res, await paymentService.remove(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'To‘lov bekor qilindi',
    });
  },
};

export const debtController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = debtListQuerySchema.parse(req.query);
    const { items, total } = await debtService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    const query = debtListQuerySchema.parse(req.query);
    sendSuccess(res, await debtService.summary(query));
  },
};
