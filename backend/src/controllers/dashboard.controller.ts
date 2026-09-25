import type { Request, Response } from 'express';
import { activityService } from '../services/activity.service.js';
import { dashboardService } from '../services/dashboard.service.js';
import { executiveService } from '../services/executive.service.js';
import { academyOverviewService } from '../services/academyOverview.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { activityQuerySchema } from '../validators/activity.validator.js';
import { chartQuerySchema, executiveQuerySchema, managerStatsQuerySchema } from '../validators/dashboard.validator.js';

export const dashboardController = {
  /** Owner/Director paneli — butun markaz holati */
  async executive(req: Request, res: Response): Promise<void> {
    const query = executiveQuerySchema.parse(req.query);
    sendSuccess(res, await executiveService.summary(query));
  },

  /** TZ 3.0 §76: rahbar dashboardidagi akademiya holati (ota-ona, vazifa, imtihon, progress, xavf, marketing, Telegram, AI) */
  async academy(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await academyOverviewService.overview());
  },

  /** Faoliyat markazi — ruxsat berilgan turlar bo‘yicha vaqt chizig‘i */
  async activity(req: Request, res: Response): Promise<void> {
    const query = activityQuerySchema.parse(req.query);
    sendSuccess(res, await activityService.feed(requireAuthUser(req), query));
  },

  async summary(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await dashboardService.summary(requireAuthUser(req)));
  },

  async charts(req: Request, res: Response): Promise<void> {
    const query = chartQuerySchema.parse(req.query);
    sendSuccess(res, await dashboardService.charts(requireAuthUser(req), query));
  },

  async funnel(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await dashboardService.funnel(requireAuthUser(req)));
  },

  async managers(req: Request, res: Response): Promise<void> {
    const query = managerStatsQuerySchema.parse(req.query);
    sendSuccess(res, await dashboardService.managers(query));
  },

  async followUps(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await dashboardService.followUps(requireAuthUser(req)));
  },
};
