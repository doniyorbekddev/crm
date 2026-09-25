import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { masteryController } from '../controllers/mastery.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';

/** Mavzu o'zlashtirish sozlamalari (TZ §27) */
export const masteryRouter = Router();

masteryRouter.use(authenticate);

masteryRouter.get('/settings', requireAnyPermission(PERMISSIONS.STUDENT_VIEW, PERMISSIONS.GROUP_VIEW), masteryController.settings);
masteryRouter.put('/settings', requirePermission(PERMISSIONS.SETTINGS_MANAGE), masteryController.updateSettings);
