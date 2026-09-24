import type { Request, Response } from 'express';
import { debtService } from '../services/debt.service.js';
import { paymentService } from '../services/payment.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { exportFormatSchema, idParamSchema } from '../validators/common.validator.js';
import {
  createPaymentSchema,
  debtListQuerySchema,
  deletePaymentSchema,
  refundPaymentSchema,
  paymentListQuerySchema,
  paymentStatsQuerySchema,
} from '../validators/payment.validator.js';
import { businessDateString } from '../utils/dates.js';
import { sendTable } from '../utils/tableExport.js';

export const paymentController = {
  /** Filtrlangan ro‘yxatni CSV yoki XLSX ga eksport qilish */
  async export(req: Request, res: Response): Promise<void> {
    const query = paymentListQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await paymentService.exportTable(query), `tolovlar-${businessDateString(new Date())}`, format);
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = paymentListQuerySchema.parse(req.query);
    const { items, total } = await paymentService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const query = paymentStatsQuerySchema.parse(req.query);
    sendSuccess(res, await paymentService.stats(requireAuthUser(req), query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await paymentService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createPaymentSchema.parse(req.body);
    const { payment, replayed } = await paymentService.create(requireAuthUser(req), input, getClientInfo(req));
    if (replayed) {
      // Xuddi shu so'rov qayta keldi (ikki marta bosish, tarmoq qayta urinishi) — yangi to'lov yaratilmadi
      sendSuccess(res, payment, { message: 'Bu to‘lov allaqachon qabul qilingan' });
      return;
    }
    sendCreated(res, payment, 'To‘lov qabul qilindi');
  },

  async refund(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = refundPaymentSchema.parse(req.body);
    sendSuccess(res, await paymentService.refund(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Pul qaytarildi',
    });
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
