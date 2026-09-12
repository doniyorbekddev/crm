import type { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../utils/refreshCookie.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/auth.validator.js';

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const input = loginSchema.parse(req.body);
    const result = await authService.login(input, getClientInfo(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, result.session, { message: 'Tizimga muvaffaqiyatli kirdingiz' });
  },

  async register(req: Request, res: Response): Promise<void> {
    const input = registerSchema.parse(req.body);
    const result = await authService.register(input, getClientInfo(req));
    sendCreated(res, result, 'Ro‘yxatdan o‘tdingiz. Administrator tasdiqlagandan so‘ng tizimga kira olasiz.');
  },

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.refresh(readRefreshCookie(req), getClientInfo(req));
      setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
      sendSuccess(res, result.session);
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  },

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(readRefreshCookie(req), getClientInfo(req));
    clearRefreshCookie(res);
    sendSuccess(res, null, { message: 'Tizimdan chiqdingiz' });
  },

  async logoutAll(req: Request, res: Response): Promise<void> {
    const user = requireAuthUser(req);
    const revokedSessions = await authService.logoutAll(user.id, getClientInfo(req));
    clearRefreshCookie(res);
    sendSuccess(res, { revokedSessions }, { message: 'Barcha qurilmalardan chiqildi' });
  },

  async me(req: Request, res: Response): Promise<void> {
    const user = requireAuthUser(req);
    sendSuccess(res, await authService.me(user.id));
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const input = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(input, getClientInfo(req));
    sendSuccess(res, null, {
      message: 'Agar bu email tizimda ro‘yxatdan o‘tgan bo‘lsa, parolni tiklash havolasi yuborildi',
    });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const input = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(input, getClientInfo(req));
    clearRefreshCookie(res);
    sendSuccess(res, null, { message: 'Parol yangilandi. Endi yangi parol bilan kiring' });
  },

  async changePassword(req: Request, res: Response): Promise<void> {
    const user = requireAuthUser(req);
    const input = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(user.id, input, getClientInfo(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    sendSuccess(res, result.session, { message: 'Parol o‘zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi' });
  },
};
