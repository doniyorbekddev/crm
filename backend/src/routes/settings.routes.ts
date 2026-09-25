import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { academySettingsController } from '../controllers/academySettings.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';

/** Umumiy sozlamalar (TZ 3.1 GAP-01): faqat `settings.manage` — OWNER va SUPER_ADMIN */
export const settingsRouter = Router();

settingsRouter.use(authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE));

settingsRouter.get('/academy', academySettingsController.get);
settingsRouter.put('/academy', academySettingsController.save);
settingsRouter.post('/academy/logo', uploadBody, academySettingsController.uploadLogo);
settingsRouter.delete('/academy/logo', academySettingsController.removeLogo);

/** Tokensiz ochiq ma'lumot — faqat brend (nom, logo, valyuta, til) */
export const publicRouter = Router();

publicRouter.get('/branding', academySettingsController.branding);
publicRouter.get('/branding/logo', academySettingsController.logo);
