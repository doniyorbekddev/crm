import type { Request, Response } from 'express';
import { ownerForActor, telegramLinkService, verifyWebhookSecret } from '../services/telegramLink.service.js';
import { isTelegramEnabled } from '../services/telegram.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { AppError } from '../utils/AppError.js';

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
