import type { Request, Response } from 'express';
import { attendanceAnalyticsService } from '../services/attendanceAnalytics.service.js';
import { attendanceSessionService } from '../services/attendanceSession.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import {
  attendanceCalendarQuerySchema,
  attendanceRankingQuerySchema,
  attendanceStatsQuerySchema,
  createSessionSchema,
  sessionListQuerySchema,
  updateSessionSchema,
} from '../validators/attendanceSession.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const attendanceSessionController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = sessionListQuerySchema.parse(req.query);
    sendSuccess(res, await attendanceSessionService.list(requireAuthUser(req), query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await attendanceSessionService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createSessionSchema.parse(req.body);
    sendCreated(res, await attendanceSessionService.create(requireAuthUser(req), input, getClientInfo(req)), 'Dars seansi ochildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateSessionSchema.parse(req.body);
    sendSuccess(res, await attendanceSessionService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Dars seansi saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await attendanceSessionService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Dars seansi o‘chirildi' });
  },
};

export const attendanceAnalyticsController = {
  async stats(req: Request, res: Response): Promise<void> {
    const query = attendanceStatsQuerySchema.parse(req.query);
    sendSuccess(res, await attendanceAnalyticsService.stats(requireAuthUser(req), query));
  },

  async ranking(req: Request, res: Response): Promise<void> {
    const query = attendanceRankingQuerySchema.parse(req.query);
    sendSuccess(res, await attendanceAnalyticsService.ranking(requireAuthUser(req), query));
  },

  async teacherOverview(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await attendanceAnalyticsService.teacherOverview(requireAuthUser(req)));
  },

  async calendar(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const query = attendanceCalendarQuerySchema.parse(req.query);
    sendSuccess(res, await attendanceAnalyticsService.calendar(requireAuthUser(req), id, query));
  },
};
