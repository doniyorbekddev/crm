import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { automationController } from '../controllers/automation.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const automationRouter = Router();

automationRouter.use(authenticate);

// Avtomatlashtirish — sozlama darajasidagi ish, shuning uchun ogohlantirish sozlamalari bilan
// bir xil ruxsat ishlatiladi (rahbar/Super Admin).
const manage = requirePermission(PERMISSIONS.ALERT_MANAGE);
const view = requirePermission(PERMISSIONS.ALERT_VIEW);

automationRouter.get('/', view, automationController.list);
automationRouter.get('/runs', view, automationController.runs);
automationRouter.put('/:key', manage, automationController.update);
automationRouter.post('/run', manage, heavyLimiter, automationController.run);
