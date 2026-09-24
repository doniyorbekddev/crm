import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { certificateController } from '../controllers/certificate.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const certificateRouter = Router();

// Ochiq tekshiruv: autentifikatsiyasiz, lekin rate limit bilan (kod tanlashdan himoya).
// Ro'yxatdan oldin turishi shart — aks holda "verify" id deb qabul qilinadi.
certificateRouter.get('/verify/:token', heavyLimiter, certificateController.verify);

certificateRouter.use(authenticate);
certificateRouter.get('/', requirePermission(PERMISSIONS.STUDENT_VIEW), certificateController.list);
// Bitta sertifikat — chop etish uchun. Ruxsat servis ichida tekshiriladi: xodim yoki egasi.
certificateRouter.get('/:id', certificateController.getById);
certificateRouter.post('/', requirePermission(PERMISSIONS.STUDENT_MANAGE), certificateController.issue);
certificateRouter.post('/:id/revoke', requirePermission(PERMISSIONS.STUDENT_MANAGE), certificateController.revoke);
