import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { PERMISSIONS } from '../config/permissions.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { workActionService } from '../services/workAction.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { snoozeSchema } from '../validators/alert.validator.js';
import { idParamSchema } from '../validators/common.validator.js';
import { taskFromSourceSchema } from '../validators/task.validator.js';
import { authenticate } from '../middleware/authenticate.js';

export const notificationRouter = Router();

// Bildirishnomalar shaxsiy — har kim faqat o‘zinikini ko‘radi, shu sababli qo‘shimcha ruxsat talab qilinmaydi.
notificationRouter.use(authenticate);

notificationRouter.get('/', notificationController.list);
notificationRouter.get('/summary', notificationController.summary);
notificationRouter.get('/settings', notificationController.settings);
notificationRouter.put('/settings', notificationController.saveSettings);
notificationRouter.patch('/read-all', notificationController.markAllRead);
notificationRouter.patch('/:id/read', notificationController.markRead);
// CRM 4.0, 2-faza — "xabar → amal"
notificationRouter.post('/:id/snooze', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await workActionService.snoozeNotification(requireAuthUser(req), id, snoozeSchema.parse(req.body)), { message: 'Kechiktirildi' });
});
notificationRouter.post('/:id/task', requirePermission(PERMISSIONS.TASK_CREATE), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendCreated(res, await workActionService.taskFromNotification(requireAuthUser(req), id, taskFromSourceSchema.parse(req.body ?? {}), getClientInfo(req)), 'Vazifa yaratildi');
});
notificationRouter.delete('/read', notificationController.clearRead);
notificationRouter.delete('/:id', notificationController.remove);
