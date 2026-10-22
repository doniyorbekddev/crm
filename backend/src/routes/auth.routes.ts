import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import { avatarService } from '../services/avatar.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { uploadBody } from './document.routes.js';

export const authRouter = Router();

// Token va shaxsiy ma'lumotli javoblar brauzer yoki proxy keshida qolmasin
authRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

authRouter.post('/login', authLimiter, authController.login);
// 2FA: parol to'g'ri bo'lgach — tasdiqlash tokeni + kod
authRouter.post('/login/2fa', authLimiter, authController.loginTwoFactor);
authRouter.post('/register', authLimiter, authController.register);
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.post('/logout-all', authenticate, authController.logoutAll);
authRouter.get('/me', authenticate, authController.me);
// Profil rasmi — faqat o'ziniki. Tana — fayl baytlari (hujjat yuklash bilan bir xil usul)
authRouter.post('/me/avatar', authenticate, uploadBody, async (req, res) => {
  sendSuccess(res, await avatarService.upload(requireAuthUser(req), req.body, getClientInfo(req)), { message: 'Profil rasmi yangilandi' });
});
authRouter.delete('/me/avatar', authenticate, async (req, res) => {
  await avatarService.remove(requireAuthUser(req), getClientInfo(req));
  sendSuccess(res, null, { message: 'Profil rasmi o‘chirildi' });
});
authRouter.get('/me/preferences', authenticate, authController.preferences);
authRouter.put('/me/preferences/:key', authenticate, authController.savePreference);
authRouter.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
authRouter.post('/reset-password', authLimiter, authController.resetPassword);
authRouter.patch('/change-password', authenticate, authController.changePassword);
// Ikki bosqichli kirish sozlamalari — faqat o'ziniki; har o'zgarish parol (va kod) bilan tasdiqlanadi
authRouter.get('/2fa', authenticate, authController.twoFactorStatus);
authRouter.post('/2fa/setup', authenticate, authLimiter, authController.twoFactorSetup);
authRouter.post('/2fa/enable', authenticate, authLimiter, authController.twoFactorEnable);
authRouter.post('/2fa/disable', authenticate, authLimiter, authController.twoFactorDisable);
authRouter.post('/2fa/recovery-codes', authenticate, authLimiter, authController.twoFactorRecoveryCodes);
