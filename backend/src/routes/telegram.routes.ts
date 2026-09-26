import { Router } from 'express';
import { telegramController } from '../controllers/telegram.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSIONS } from '../config/permissions.js';
import { uploadBody } from './document.routes.js';

export const telegramRouter = Router();

// Webhook — autentifikatsiyasiz, imzo bilan himoyalangan (controller ichida tekshiriladi).
// Rate limit: bot tomonidan kelgan oqim cheklanadi.
telegramRouter.post('/webhook', webhookLimiter, telegramController.webhook);

// Qolgan yo'llar — kirgan foydalanuvchining o'z bog'lanishi (ownership)
telegramRouter.get('/me', authenticate, telegramController.myLink);
telegramRouter.delete('/me', authenticate, telegramController.unlink);

// Bot sog'lomligi — sozlamalarni boshqaradigan xodim uchun
telegramRouter.get('/health', authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE), telegramController.health);

// Ommaviy xabar — alohida ruxsat (admin/rahbar)
const broadcast = requirePermission(PERMISSIONS.BROADCAST_SEND);
telegramRouter.get('/broadcasts', authenticate, broadcast, telegramController.broadcastList);
telegramRouter.post('/broadcasts/preview', authenticate, broadcast, telegramController.broadcastPreview);
telegramRouter.post('/broadcasts', authenticate, broadcast, telegramController.broadcastSend);
// Rasm/PDF yuklash (xom tana, nomi X-File-Name da) → yuborishda ishlatiladigan token (TZ 3.1 GAP-15)
telegramRouter.post('/broadcasts/media', authenticate, broadcast, uploadBody, telegramController.broadcastMedia);
telegramRouter.get('/broadcasts/:id', authenticate, broadcast, telegramController.broadcastGet);
