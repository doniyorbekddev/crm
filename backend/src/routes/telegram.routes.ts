import { Router } from 'express';
import { telegramController } from '../controllers/telegram.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../config/permissions.js';

export const telegramRouter = Router();

// Webhook — autentifikatsiyasiz, imzo bilan himoyalangan (controller ichida tekshiriladi).
// Rate limit: bot tomonidan kelgan oqim cheklanadi.
telegramRouter.post('/webhook', heavyLimiter, telegramController.webhook);

// Qolgan yo'llar — kirgan foydalanuvchining o'z bog'lanishi (ownership)
telegramRouter.get('/me', authenticate, telegramController.myLink);
telegramRouter.delete('/me', authenticate, telegramController.unlink);

// Ommaviy xabar — alohida ruxsat (admin/rahbar)
const broadcast = requirePermission(PERMISSIONS.BROADCAST_SEND);
telegramRouter.get('/broadcasts', authenticate, broadcast, telegramController.broadcastList);
telegramRouter.post('/broadcasts/preview', authenticate, broadcast, telegramController.broadcastPreview);
telegramRouter.post('/broadcasts', authenticate, broadcast, telegramController.broadcastSend);
