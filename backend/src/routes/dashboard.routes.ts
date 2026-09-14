import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requirePermission(PERMISSIONS.DASHBOARD_VIEW));

dashboardRouter.get('/summary', dashboardController.summary);
dashboardRouter.get('/executive', requirePermission(PERMISSIONS.ANALYTICS_VIEW), dashboardController.executive);
dashboardRouter.get('/activity', heavyLimiter, requirePermission(PERMISSIONS.ANALYTICS_VIEW), dashboardController.activity);
dashboardRouter.get('/charts', dashboardController.charts);
dashboardRouter.get('/funnel', requirePermission(PERMISSIONS.LEAD_VIEW), dashboardController.funnel);
dashboardRouter.get('/follow-ups', requirePermission(PERMISSIONS.FOLLOWUP_VIEW), dashboardController.followUps);
dashboardRouter.get('/managers', requirePermission(PERMISSIONS.REPORT_VIEW), dashboardController.managers);
