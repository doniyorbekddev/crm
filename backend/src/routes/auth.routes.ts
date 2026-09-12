import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';

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
authRouter.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
authRouter.post('/reset-password', authLimiter, authController.resetPassword);
authRouter.patch('/change-password', authenticate, authController.changePassword);
