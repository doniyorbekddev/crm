import type { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { attendanceQuerySchema, markAttendanceSchema } from '../validators/attendance.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const attendanceController = {
  async getSheet(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { date } = attendanceQuerySchema.parse(req.query);
    sendSuccess(res, await attendanceService.getSheet(requireAuthUser(req), id, date));
  },

  async mark(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = markAttendanceSchema.parse(req.body);
    sendSuccess(res, await attendanceService.mark(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Davomat saqlandi',
    });
  },
};
