import type { Request, Response } from 'express';
import { ownerForActor, telegramLinkService, verifyWebhookSecret } from '../services/telegramLink.service.js';
import { isTelegramEnabled } from '../services/telegram.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { AppError } from '../utils/AppError.js';
import { broadcastService } from '../services/broadcast.service.js';
import { broadcastSchema } from '../validators/broadcast.validator.js';
import { getClientInfo } from '../utils/requestContext.js';

export const telegramController = {
  /** Joriy foydalanuvchining bog‘lanish holati va ulash havolasi */
  async myLink(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const link = await telegramLinkService.ensureLink(await ownerForActor(actor.id));
    sendSuccess(res, { ...link, enabled: isTelegramEnabled() });
  },

  async unlink(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    await telegramLinkService.unlink(await ownerForActor(actor.id), actor.id);
    sendSuccess(res, null, { message: 'Telegram uzildi' });
  },

  /** Xodim ota-onaga (yoki o‘quvchiga) ulash havolasini beradi — ularda CRM hisobi bo‘lmasligi mumkin */
  async linkForParent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const link = await telegramLinkService.ensureLink({ parentId: id });
    sendSuccess(res, { ...link, enabled: isTelegramEnabled() });
  },

  async linkForStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const link = await telegramLinkService.ensureLink({ studentId: id });
    sendSuccess(res, { ...link, enabled: isTelegramEnabled() });
  },

  /** Bot holati — monitoring (navbat, xatolar, oxirgi faollik) */
  async health(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await telegramLinkService.health());
  },

  async broadcastPreview(req: Request, res: Response): Promise<void> {
    const input = broadcastSchema.parse(req.body);
    sendSuccess(res, await broadcastService.preview(requireAuthUser(req), input));
  },

  async broadcastSend(req: Request, res: Response): Promise<void> {
    const input = broadcastSchema.parse(req.body);
    const result = await broadcastService.send(requireAuthUser(req), input, getClientInfo(req));
    sendSuccess(res, result, { message: `Xabar ${result.recipients} ta chatga navbatga qo‘yildi` });
  },

  async broadcastList(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await broadcastService.list(requireAuthUser(req)));
  },

  /**
   * Telegram webhook'i. Autentifikatsiya yo‘q — o‘rniga Telegram yuboradigan
   * `X-Telegram-Bot-Api-Secret-Token` sarlavhasi tekshiriladi.
   */
  async webhook(req: Request, res: Response): Promise<void> {
    const header = req.get('x-telegram-bot-api-secret-token');
    if (!verifyWebhookSecret(header)) {
      throw AppError.unauthorized('Webhook imzosi noto‘g‘ri');
    }
    const result = await telegramLinkService.handleUpdate(req.body);
    // Telegram javob kodiga qaraydi — har doim 200 qaytariladi, aks holda u qayta yuboraveradi
    sendSuccess(res, result);
  },
};
