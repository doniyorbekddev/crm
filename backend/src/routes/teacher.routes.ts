import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { salaryController } from '../controllers/salary.controller.js';
import { teacherController } from '../controllers/teacher.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const teacherRouter = Router();

teacherRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.TEACHER_VIEW);
const manage = requirePermission(PERMISSIONS.TEACHER_MANAGE);
const salaryView = requirePermission(PERMISSIONS.SALARY_VIEW);

/** O‘qituvchi o‘z ma'lumotini ruxsatsiz ko‘radi — profil egasi bo‘lishi kifoya */
teacherRouter.get('/me', teacherController.myTeaching);

teacherRouter.get('/', view, teacherController.list);
teacherRouter.get('/candidates', manage, teacherController.candidates);
teacherRouter.get('/:id', view, teacherController.getById);
teacherRouter.post('/', manage, teacherController.create);
teacherRouter.put('/:id', manage, teacherController.update);

teacherRouter.get('/:id/salary-rules', salaryView, teacherController.salaryRules);
teacherRouter.post('/:id/salary-rules', manage, teacherController.createSalaryRule);
teacherRouter.get('/:id/salary-periods', salaryView, teacherController.salaryHistory);

export const salaryRouter = Router();

salaryRouter.use(authenticate);

salaryRouter.get('/periods', salaryView, salaryController.periods);
salaryRouter.get('/summary', salaryView, salaryController.summary);
salaryRouter.get('/periods/:id', salaryView, salaryController.getById);
salaryRouter.post('/calculate', heavyLimiter, requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.calculate);
salaryRouter.patch('/periods/:id', requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.adjust);
salaryRouter.post('/periods/:id/approve', requirePermission(PERMISSIONS.SALARY_APPROVE), salaryController.approve);
salaryRouter.post('/periods/:id/payments', requirePermission(PERMISSIONS.SALARY_PAY), salaryController.pay);
salaryRouter.post('/periods/:id/unlock', requirePermission(PERMISSIONS.SALARY_UNLOCK), salaryController.unlock);
salaryRouter.post('/adjustments', requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.addAdjustment);
salaryRouter.post('/adjustments/:id/void', requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.voidAdjustment);

/**
 * Spec bo‘yicha payroll yo‘llari (promt 72-bo‘lim) — /salaries bilan bir xil servis.
 * GET /payroll, GET /payroll/:id, POST /payroll/calculate, /:id/approve, /:id/pay, /:id/unlock
 */
export const payrollRouter = Router();

payrollRouter.use(authenticate);

payrollRouter.get('/', salaryView, salaryController.periods);
payrollRouter.get('/summary', salaryView, salaryController.summary);
payrollRouter.post('/calculate', heavyLimiter, requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.calculate);
payrollRouter.post('/adjustments', requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.addAdjustment);
payrollRouter.post('/adjustments/:id/void', requirePermission(PERMISSIONS.SALARY_CALCULATE), salaryController.voidAdjustment);
payrollRouter.get('/:id', salaryView, salaryController.getById);
payrollRouter.post('/:id/approve', requirePermission(PERMISSIONS.SALARY_APPROVE), salaryController.approve);
payrollRouter.post('/:id/pay', requirePermission(PERMISSIONS.SALARY_PAY), salaryController.pay);
payrollRouter.post('/:id/unlock', requirePermission(PERMISSIONS.SALARY_UNLOCK), salaryController.unlock);
