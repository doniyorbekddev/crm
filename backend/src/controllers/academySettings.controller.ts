import type { Request, Response } from 'express';
import { academySettingsService } from '../services/academySettings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import { academySettingsSchema } from '../validators/academySettings.validator.js';

export const academySettingsController = {
  async get(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await academySettingsService.get());
  },

  async save(req: Request, res: Response): Promise<void> {
    const input = academySettingsSchema.parse(req.body);
    sendSuccess(res, await academySettingsService.save(requireAuthUser(req), input, getClientInfo(req)), { message: 'Markaz ma’lumotlari saqlandi' });
  },

  async uploadLogo(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await academySettingsService.uploadLogo(requireAuthUser(req), req.body, getClientInfo(req)), { message: 'Logo yangilandi' });
  },

  async removeLogo(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await academySettingsService.removeLogo(requireAuthUser(req), getClientInfo(req)), { message: 'Logo o‘chirildi' });
  },

  /** Ochiq: login sahifasi, sarlavha va valyuta uchun (maxfiy ma'lumot yo'q — telefon/manzil qaytarilmaydi) */
  async branding(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await academySettingsService.branding());
  },

  async logo(_req: Request, res: Response): Promise<void> {
    // URL versiyalangan (?v=...) — yangilanganda manzil o'zgaradi, shuning uchun uzoq keshlash xavfsiz
    await sendStoredFile(res, await academySettingsService.logoFile(), 'public, max-age=86400');
  },
};
