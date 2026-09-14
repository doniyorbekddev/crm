import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { alertController, targetController } from '../controllers/alert.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const alertRouter = Router();

alertRouter.use(authenticate, requirePermission(PERMISSIONS.ALERT_VIEW));

alertRouter.get('/', alertController.list);
alertRouter.get('/summary', alertController.summary);
alertRouter.get('/settings', alertController.settings);
alertRouter.put('/settings', requirePermission(PERMISSIONS.ALERT_MANAGE), alertController.updateSettings);
// Kechagi kunlik xulosa (rahbar paneli bilan bir xil ruxsat)
alertRouter.get('/digest', requirePermission(PERMISSIONS.ANALYTICS_VIEW), heavyLimiter, alertController.digest);
// Barcha qoidalarni ishga tushiradi — takroriy chaqiruvlar cheklanadi
alertRouter.post('/evaluate', heavyLimiter, alertController.evaluate);
alertRouter.post('/read-all', alertController.readAll);
alertRouter.patch('/:id/read', alertController.read);
alertRouter.patch('/:id/resolve', alertController.resolve);
// "Dismiss" — qo'lda yopish bilan bir xil
alertRouter.patch('/:id/dismiss', alertController.resolve);

export const targetRouter = Router();

targetRouter.use(authenticate);

targetRouter.get('/', requirePermission(PERMISSIONS.TARGET_VIEW), targetController.overview);
targetRouter.put('/', requirePermission(PERMISSIONS.TARGET_MANAGE), targetController.save);
