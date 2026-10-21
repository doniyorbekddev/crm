import type { Request, Response } from 'express';
import { smsSettingsService } from '../services/smsSettings.service.js';
import type { SmsSettings } from '../services/smsSettings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { smsSettingsSchema, smsTestSchema } from '../validators/smsSettings.validator.js';

export const smsSettingsController = {
  async get(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await smsSettingsService.get());
  },

  async save(req: Request, res: Response): Promise<void> {
    const input = smsSettingsSchema.parse(req.body) as SmsSettings;
    sendSuccess(res, await smsSettingsService.save(requireAuthUser(req), input, getClientInfo(req)), { message: 'SMS sozlamalari saqlandi' });
  },

  async test(req: Request, res: Response): Promise<void> {
    const input = smsTestSchema.parse(req.body);
    sendSuccess(res, await smsSettingsService.test(requireAuthUser(req), input, getClientInfo(req)), { message: 'Sinov SMS yuborildi' });
  },

  async balance(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, { balance: await smsSettingsService.balance() });
  },
};
