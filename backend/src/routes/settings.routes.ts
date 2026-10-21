import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { academySettingsController } from '../controllers/academySettings.controller.js';
import { smsSettingsController } from '../controllers/smsSettings.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';
import { avatarService } from '../services/avatar.service.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';

/** Umumiy sozlamalar (TZ 3.1 GAP-01): faqat `settings.manage` — OWNER va SUPER_ADMIN */
export const settingsRouter = Router();

settingsRouter.use(authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE));

settingsRouter.get('/academy', academySettingsController.get);
settingsRouter.put('/academy', academySettingsController.save);
settingsRouter.post('/academy/logo', uploadBody, academySettingsController.uploadLogo);
settingsRouter.delete('/academy/logo', academySettingsController.removeLogo);
// SMS zaxira kanali (Eskiz.uz): kalitlar faqat server env'da — bu yerda holat, turlar va limit
settingsRouter.get('/sms', smsSettingsController.get);
settingsRouter.put('/sms', smsSettingsController.save);
settingsRouter.get('/sms/balance', smsSettingsController.balance);
settingsRouter.post('/sms/test', heavyLimiter, smsSettingsController.test);

/** Tokensiz ochiq ma'lumot — faqat brend (nom, logo, valyuta, til) */
export const publicRouter = Router();

publicRouter.get('/branding', academySettingsController.branding);
publicRouter.get('/branding/logo', academySettingsController.logo);
// Profil rasmlari: tokensiz, lekin manzil taxmin qilib bo'lmaydigan tasodifiy nom (services/avatar.service.ts)
publicRouter.get('/avatars/:year/:month/:file', async (req, res) => {
  const file = await avatarService.file(`${String(req.params.year)}/${String(req.params.month)}/${String(req.params.file)}`);
  // Nom o'zgarmas (rasm almashsa yangi nom) — uzoq kesh xavfsiz
  await sendStoredFile(res, file, 'public, max-age=31536000, immutable');
});
