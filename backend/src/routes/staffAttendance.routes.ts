import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { staffAttendanceController as controller } from '../controllers/staffAttendance.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter, staffQrIssueLimiter, staffScanLimiter } from '../middleware/rateLimiter.js';
import { requirePermission, requireStaff } from '../middleware/requirePermission.js';

/**
 * Xodim davomati (QR). Xodim kimligi faqat sessiyadan (`req.user`) olinadi — body'dagi ID qabul qilinmaydi.
 *  - `/qr*`        — qabulxona ekrani (`staff_attendance.display`);
 *  - `/me*`, `/scan*` — har bir xodim o'zi uchun (kabinet hisoblari emas);
 *  - qolganlari    — rahbar (`staff_attendance.view` / `.manage`).
 */
export const staffAttendanceRouter = Router();

staffAttendanceRouter.use(authenticate);

const display = requirePermission(PERMISSIONS.STAFF_ATTENDANCE_DISPLAY);
const view = requirePermission(PERMISSIONS.STAFF_ATTENDANCE_VIEW);
const manage = requirePermission(PERMISSIONS.STAFF_ATTENDANCE_MANAGE);
const staff = requireStaff();

staffAttendanceRouter.post('/qr', display, staffQrIssueLimiter, controller.issueQr);
staffAttendanceRouter.get('/qr/:id', display, controller.qrStatus);

staffAttendanceRouter.get('/me/today', staff, controller.today);
staffAttendanceRouter.get('/me/month', staff, controller.myMonth);
staffAttendanceRouter.get('/me/requests', staff, controller.myRequests);
staffAttendanceRouter.post('/me/requests', staff, controller.createMyRequest);
staffAttendanceRouter.post('/me/requests/:id/cancel', staff, controller.cancelMyRequest);
staffAttendanceRouter.post('/scan/preview', staff, staffScanLimiter, controller.preview);
staffAttendanceRouter.post('/scan', staff, staffScanLimiter, controller.scan);

staffAttendanceRouter.get('/overview', view, controller.overview);
staffAttendanceRouter.get('/report', view, controller.report);
staffAttendanceRouter.get('/report/export', view, heavyLimiter, controller.exportReport);
staffAttendanceRouter.get('/users/:userId/days/:date', view, controller.dayDetail);
staffAttendanceRouter.post('/users/:userId/days/:date/corrections', manage, controller.correct);

staffAttendanceRouter.get('/requests', view, controller.requests);
staffAttendanceRouter.post('/requests/:id/decide', manage, controller.decideRequest);
staffAttendanceRouter.post('/users/:userId/requests', manage, controller.grantRequest);

staffAttendanceRouter.get('/schedules', view, controller.schedules);
staffAttendanceRouter.put('/schedules/:userId', manage, controller.saveSchedule);
staffAttendanceRouter.get('/exceptions', view, controller.exceptions);
staffAttendanceRouter.put('/schedules/:userId/exceptions', manage, controller.saveException);
staffAttendanceRouter.delete('/exceptions/:id', manage, controller.removeException);
staffAttendanceRouter.get('/holidays', view, controller.holidays);
staffAttendanceRouter.post('/holidays', manage, controller.addHoliday);
staffAttendanceRouter.delete('/holidays/:id', manage, controller.removeHoliday);
