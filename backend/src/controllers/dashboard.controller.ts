import type { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service.js';
import { executiveService } from '../services/executive.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';
import { chartQuerySchema, executiveQuerySchema, managerStatsQuerySchema } from '../validators/dashboard.validator.js';

export const dashboardController = {
  /** Owner/Director paneli — butun markaz holati */
  async executive(req: Request, res: Response): Promise<void> {
    const query = executiveQuerySchema.parse(req.query);
    sendSuccess(res, await executiveService.summary(query));
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
