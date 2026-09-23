import { Router } from 'express';
import { telegramController } from '../controllers/telegram.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';

export const telegramRouter = Router();

// Webhook — autentifikatsiyasiz, imzo bilan himoyalangan (controller ichida tekshiriladi).
// Rate limit: bot tomonidan kelgan oqim cheklanadi.
telegramRouter.post('/webhook', heavyLimiter, telegramController.webhook);

// Qolgan yo'llar — kirgan foydalanuvchining o'z bog'lanishi (ownership)
telegramRouter.get('/me', authenticate, telegramController.myLink);
telegramRouter.delete('/me', authenticate, telegramController.unlink);
