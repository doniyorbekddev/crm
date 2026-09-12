import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/authenticate.js';

export const notificationRouter = Router();

// Bildirishnomalar shaxsiy — har kim faqat o‘zinikini ko‘radi, shu sababli qo‘shimcha ruxsat talab qilinmaydi.
notificationRouter.use(authenticate);

notificationRouter.get('/', notificationController.list);
notificationRouter.get('/summary', notificationController.summary);
notificationRouter.patch('/read-all', notificationController.markAllRead);
notificationRouter.patch('/:id/read', notificationController.markRead);
notificationRouter.delete('/read', notificationController.clearRead);
notificationRouter.delete('/:id', notificationController.remove);
