import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { alertController, targetController } from '../controllers/alert.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { workActionService } from '../services/workAction.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { assignAlertSchema, snoozeSchema } from '../validators/alert.validator.js';
import { idParamSchema } from '../validators/common.validator.js';
import { taskFromSourceSchema } from '../validators/task.validator.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const alertRouter = Router();

alertRouter.use(authenticate, requirePermission(PERMISSIONS.ALERT_VIEW));

alertRouter.get('/', alertController.list);
alertRouter.get('/summary', alertController.summary);
alertRouter.get('/assignees', requirePermission(PERMISSIONS.TASK_ASSIGN), async (req, res) => {
  sendSuccess(res, await workActionService.alertAssignees(requireAuthUser(req)));
});
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

// CRM 4.0, 2-faza — "xabar → amal": biriktirish, kechiktirish, vazifaga aylantirish
alertRouter.post('/:id/assign', requirePermission(PERMISSIONS.TASK_ASSIGN), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await workActionService.assignAlert(requireAuthUser(req), id, assignAlertSchema.parse(req.body), getClientInfo(req)), { message: 'Mas’ul belgilandi' });
});
alertRouter.post('/:id/snooze', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await workActionService.snoozeAlert(requireAuthUser(req), id, snoozeSchema.parse(req.body), getClientInfo(req)), { message: 'Kechiktirildi' });
});
alertRouter.delete('/:id/snooze', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await workActionService.unsnoozeAlert(requireAuthUser(req), id), { message: 'Kechiktirish bekor qilindi' });
});
alertRouter.post('/:id/task', requirePermission(PERMISSIONS.TASK_CREATE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendCreated(res, await workActionService.taskFromAlert(requireAuthUser(req), id, taskFromSourceSchema.parse(req.body ?? {}), getClientInfo(req)), 'Vazifa yaratildi');
});

export const targetRouter = Router();

targetRouter.use(authenticate);

targetRouter.get('/', requirePermission(PERMISSIONS.TARGET_VIEW), targetController.overview);
targetRouter.put('/', requirePermission(PERMISSIONS.TARGET_MANAGE), targetController.save);
