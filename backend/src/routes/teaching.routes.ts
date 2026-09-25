import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { teachingController } from '../controllers/teaching.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission } from '../middleware/requirePermission.js';

/**
 * O'qituvchi boshqaruv markazi (TZ §28). Kirish — dars o'tadigan yoki vazifa beradigan xodim;
 * ma'lumot doirasi servisda (`teachingAccess`): o'qituvchi faqat o'z guruhlari.
 */
export const teachingRouter = Router();

teachingRouter.use(authenticate);

const teachingAccess = requireAnyPermission(PERMISSIONS.ATTENDANCE_MARK, PERMISSIONS.HOMEWORK_MANAGE, PERMISSIONS.GROUP_MANAGE);

teachingRouter.get('/overview', teachingAccess, teachingController.overview);
teachingRouter.get('/groups/:id', teachingAccess, teachingController.group);
