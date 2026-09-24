import type { Request, Response } from 'express';
import { notificationService } from '../services/notification.service.js';
import { buildPaginationMeta, sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { notificationListQuerySchema, notificationSettingsSchema } from '../validators/notification.validator.js';

export const notificationController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = notificationListQuerySchema.parse(req.query);
    const { items, total } = await notificationService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await notificationService.summary(requireAuthUser(req)));
  },

  async settings(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await notificationService.settings(requireAuthUser(req)));
  },

  async saveSettings(req: Request, res: Response): Promise<void> {
    const { items } = notificationSettingsSchema.parse(req.body);
    sendSuccess(res, await notificationService.saveSettings(requireAuthUser(req), items), { message: 'Sozlamalar saqlandi' });
  },

  async markRead(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await notificationService.markRead(requireAuthUser(req), id), { message: 'O‘qilgan deb belgilandi' });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const count = await notificationService.markAllRead(requireAuthUser(req));
    sendSuccess(res, { count }, { message: count === 0 ? 'O‘qilmagan bildirishnoma yo‘q' : `${count} ta bildirishnoma o‘qilgan deb belgilandi` });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await notificationService.remove(requireAuthUser(req), id);
    sendSuccess(res, null, { message: 'Bildirishnoma o‘chirildi' });
  },

  async clearRead(req: Request, res: Response): Promise<void> {
    const count = await notificationService.clearRead(requireAuthUser(req));
    sendSuccess(res, { count }, { message: count === 0 ? 'O‘qilgan bildirishnoma yo‘q' : `${count} ta bildirishnoma tozalandi` });
  },
};
