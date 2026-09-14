import type { Request, Response } from 'express';
import { alertService } from '../services/alert.service.js';
import { digestService } from '../services/digest.service.js';
import { targetService } from '../services/target.service.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  alertListQuerySchema,
  alertSettingsSchema,
  digestQuerySchema,
  resolveAlertSchema,
  saveTargetSchema,
  targetQuerySchema,
} from '../validators/alert.validator.js';

export const alertController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = alertListQuerySchema.parse(req.query);
    const { items, total } = await alertService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await alertService.summary());
  },

  async evaluate(_req: Request, res: Response): Promise<void> {
    const result = await alertService.evaluate(new Date());
    sendSuccess(res, result, {
      message: `Tekshirildi: ${result.created} ta yangi, ${result.resolved} ta avtomatik yopildi`,
    });
  },

  async read(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await alertService.markRead(requireAuthUser(req), id), { message: 'O‘qildi deb belgilandi' });
  },

  async readAll(req: Request, res: Response): Promise<void> {
    const result = await alertService.markAllRead(requireAuthUser(req));
    sendSuccess(res, result, { message: `${result.updated} ta ogohlantirish o‘qildi deb belgilandi` });
  },

  async resolve(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = resolveAlertSchema.parse(req.body ?? {});
    sendSuccess(res, await alertService.resolve(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Ogohlantirish yopildi',
    });
  },

  async settings(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await alertService.settings());
  },

  async updateSettings(req: Request, res: Response): Promise<void> {
    const input = alertSettingsSchema.parse(req.body);
    sendSuccess(res, await alertService.updateSettings(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Ogohlantirish sozlamalari saqlandi',
    });
  },

  async digest(req: Request, res: Response): Promise<void> {
    const query = digestQuerySchema.parse(req.query);
    sendSuccess(res, await digestService.build(query.date));
  },
};

export const targetController = {
  async overview(req: Request, res: Response): Promise<void> {
    const query = targetQuerySchema.parse(req.query);
    sendSuccess(res, await targetService.overview(requireAuthUser(req), query));
  },

  async save(req: Request, res: Response): Promise<void> {
    const input = saveTargetSchema.parse(req.body);
    sendSuccess(res, await targetService.save(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Reja saqlandi',
    });
  },
};
