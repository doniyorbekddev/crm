import type { Request, Response } from 'express';
import { staffAttendanceAdminService } from '../services/staffAttendance/admin.service.js';
import { staffAttendanceService } from '../services/staffAttendance/attendance.service.js';
import { staffPermissionService } from '../services/staffAttendance/requests.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { businessDateString } from '../utils/dates.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendTable } from '../utils/tableExport.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  correctionSchema,
  dateQuerySchema,
  decideRequestSchema,
  exceptionSchema,
  exportQuerySchema,
  holidaySchema,
  monthQuerySchema,
  permissionRequestSchema,
  qrTokenSchema,
  rangeQuerySchema,
  requestListQuerySchema,
  scanSchema,
  scheduleSchema,
  userDateParamsSchema,
  userParamsSchema,
  yearQuerySchema,
} from '../validators/staffAttendance.validator.js';

export const staffAttendanceController = {
  // Qabulxona ekrani
  async issueQr(req: Request, res: Response): Promise<void> {
    sendCreated(res, await staffAttendanceService.issueQr(requireAuthUser(req)), 'QR kod yangilandi');
  },

  async qrStatus(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await staffAttendanceService.qrStatus(requireAuthUser(req), id));
  },

  // Xodim
  async today(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await staffAttendanceService.today(requireAuthUser(req)));
  },

  async myMonth(req: Request, res: Response): Promise<void> {
    const { year, month } = monthQuerySchema.parse(req.query);
    sendSuccess(res, await staffAttendanceService.myMonth(requireAuthUser(req), year, month));
  },

  async preview(req: Request, res: Response): Promise<void> {
    const { token } = qrTokenSchema.parse(req.body);
    sendSuccess(res, await staffAttendanceService.preview(requireAuthUser(req), token));
  },

  async scan(req: Request, res: Response): Promise<void> {
    const { token, action } = scanSchema.parse(req.body);
    const result = await staffAttendanceService.scan(requireAuthUser(req), token, action, getClientInfo(req));
    sendSuccess(res, result, { message: result.message });
  },

  async myRequests(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await staffPermissionService.listMine(requireAuthUser(req)));
  },

  async createMyRequest(req: Request, res: Response): Promise<void> {
    const input = permissionRequestSchema.parse(req.body);
    sendCreated(res, await staffPermissionService.createMine(requireAuthUser(req), input, getClientInfo(req)), 'So‘rov yuborildi');
  },

  async cancelMyRequest(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await staffPermissionService.cancelMine(requireAuthUser(req), id, getClientInfo(req)), { message: 'So‘rov bekor qilindi' });
  },

  // Rahbar
  async overview(req: Request, res: Response): Promise<void> {
    const { date } = dateQuerySchema.parse(req.query);
    sendSuccess(res, await staffAttendanceAdminService.overview(requireAuthUser(req), date));
  },

  async dayDetail(req: Request, res: Response): Promise<void> {
    const { userId, date } = userDateParamsSchema.parse(req.params);
    sendSuccess(res, await staffAttendanceAdminService.dayDetail(requireAuthUser(req), userId, date));
  },

  async report(req: Request, res: Response): Promise<void> {
    const { from, to } = rangeQuerySchema.parse(req.query);
    sendSuccess(res, await staffAttendanceAdminService.report(requireAuthUser(req), from, to));
  },

  async exportReport(req: Request, res: Response): Promise<void> {
    const { from, to, format } = exportQuerySchema.parse(req.query);
    rangeQuerySchema.parse({ from, to });
    const table = await staffAttendanceAdminService.exportReport(requireAuthUser(req), from, to);
    sendTable(res, table, `xodimlar-davomati-${from}_${to}`, format);
  },

  async requests(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await staffPermissionService.list(requireAuthUser(req), requestListQuerySchema.parse(req.query)));
  },

  async decideRequest(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = decideRequestSchema.parse(req.body);
    const result = await staffPermissionService.decide(requireAuthUser(req), id, input, getClientInfo(req));
    sendSuccess(res, result, { message: input.status === 'APPROVED' ? 'So‘rov tasdiqlandi' : 'So‘rov rad etildi' });
  },

  async grantRequest(req: Request, res: Response): Promise<void> {
    const { userId } = userParamsSchema.parse(req.params);
    const input = permissionRequestSchema.parse(req.body);
    sendCreated(res, await staffPermissionService.createFor(requireAuthUser(req), userId, input, getClientInfo(req)), 'Ruxsat qayd etildi');
  },

  async schedules(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await staffAttendanceAdminService.schedules(requireAuthUser(req)));
  },

  async saveSchedule(req: Request, res: Response): Promise<void> {
    const { userId } = userParamsSchema.parse(req.params);
    const input = scheduleSchema.parse(req.body);
    sendSuccess(res, await staffAttendanceAdminService.saveSchedule(requireAuthUser(req), userId, input, getClientInfo(req)), {
      message: 'Ish jadvali saqlandi',
    });
  },

  async holidays(req: Request, res: Response): Promise<void> {
    const { year } = yearQuerySchema.parse({ year: req.query.year ?? businessDateString(new Date()).slice(0, 4) });
    sendSuccess(res, await staffAttendanceAdminService.holidays(year));
  },

  async addHoliday(req: Request, res: Response): Promise<void> {
    const input = holidaySchema.parse(req.body);
    sendCreated(res, await staffAttendanceAdminService.addHoliday(requireAuthUser(req), input, getClientInfo(req)), 'Dam olish kuni qo‘shildi');
  },

  async removeHoliday(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await staffAttendanceAdminService.removeHoliday(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Dam olish kuni olib tashlandi' });
  },

  async exceptions(req: Request, res: Response): Promise<void> {
    const { from, to } = rangeQuerySchema.parse(req.query);
    sendSuccess(res, await staffAttendanceAdminService.exceptions(requireAuthUser(req), from, to));
  },

  async saveException(req: Request, res: Response): Promise<void> {
    const { userId } = userParamsSchema.parse(req.params);
    const input = exceptionSchema.parse(req.body);
    sendSuccess(res, await staffAttendanceAdminService.saveException(requireAuthUser(req), userId, input, getClientInfo(req)), {
      message: 'Kun jadvali o‘zgartirildi',
    });
  },

  async removeException(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await staffAttendanceAdminService.removeException(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'O‘zgarish bekor qilindi' });
  },

  async correct(req: Request, res: Response): Promise<void> {
    const { userId, date } = userDateParamsSchema.parse(req.params);
    const input = correctionSchema.parse(req.body);
    sendSuccess(res, await staffAttendanceAdminService.correct(requireAuthUser(req), userId, date, input, getClientInfo(req)), {
      message: 'Tuzatish saqlandi',
    });
  },
};
