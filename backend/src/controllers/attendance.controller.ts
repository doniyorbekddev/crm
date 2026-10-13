import type { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { businessDateString } from '../utils/dates.js';
import { attendanceDayQuerySchema, attendanceQuerySchema, markAttendanceSchema } from '../validators/attendance.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const attendanceController = {
  /** Kunlik taxta — sana berilmasa o'quv markaz vaqti bo'yicha bugun (server vaqt zonasi emas) */
  async day(req: Request, res: Response): Promise<void> {
    const { date } = attendanceDayQuerySchema.parse(req.query);
    const day = date ?? new Date(`${businessDateString(new Date())}T00:00:00.000Z`);
    sendSuccess(res, await attendanceService.day(requireAuthUser(req), day));
  },

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
