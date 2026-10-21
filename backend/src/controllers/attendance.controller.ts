import type { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { businessDateString } from '../utils/dates.js';
import { attendanceDayQuerySchema, attendanceMonthQuerySchema, attendanceQuerySchema, markAttendanceSchema } from '../validators/attendance.validator.js';
import { attendanceJournalService } from '../services/attendanceJournal.service.js';
import { exportFormatSchema } from '../validators/common.validator.js';
import { sendTable } from '../utils/tableExport.js';
import { idParamSchema } from '../validators/common.validator.js';

function parseMonth(query: unknown): { year: number; month: number } {
  const value = attendanceMonthQuerySchema.parse(query).month ?? businessDateString(new Date()).slice(0, 7);
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

export const attendanceController = {
  /** Kunlik taxta — sana berilmasa o'quv markaz vaqti bo'yicha bugun (server vaqt zonasi emas) */
  async day(req: Request, res: Response): Promise<void> {
    const { date } = attendanceDayQuerySchema.parse(req.query);
    const day = date ?? new Date(`${businessDateString(new Date())}T00:00:00.000Z`);
    sendSuccess(res, await attendanceService.day(requireAuthUser(req), day));
  },

  /** Kun davomati ro'yxati (status filtri frontendda) — sana berilmasa bugun */
  async dayRecords(req: Request, res: Response): Promise<void> {
    const { date } = attendanceDayQuerySchema.parse(req.query);
    const day = date ?? new Date(`${businessDateString(new Date())}T00:00:00.000Z`);
    sendSuccess(res, await attendanceService.dayRecords(requireAuthUser(req), day));
  },

  /** Guruhning oylik davomat jurnali (o'quvchilar × dars kunlari) */
  async month(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { year, month } = parseMonth(req.query);
    sendSuccess(res, await attendanceJournalService.month(requireAuthUser(req), id, year, month));
  },

  async monthExport(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { year, month } = parseMonth(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    const journal = await attendanceJournalService.month(requireAuthUser(req), id, year, month);
    const slug = journal.group.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    sendTable(res, attendanceJournalService.toExport(journal), `davomat-${slug}-${year}-${String(month).padStart(2, '0')}`, format);
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
