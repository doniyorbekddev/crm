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
