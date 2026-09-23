import type { Request, Response } from 'express';
import { attendanceService } from '../services/attendance.service.js';
import { studentService } from '../services/student.service.js';
import { studentRiskService } from '../services/studentRisk.service.js';
import { studentProgressService } from '../services/studentProgress.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { exportFormatSchema, idParamSchema } from '../validators/common.validator.js';
import {
  atRiskQuerySchema,
  convertLeadSchema,
  createStudentSchema,
  studentListQuerySchema,
  transferStudentGroupSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
} from '../validators/student.validator.js';
import { businessDateString } from '../utils/dates.js';
import { sendTable } from '../utils/tableExport.js';

export const studentController = {
  /** Profil: davomat, uy vazifasi, imtihon, XP, izohlar va progress grafigi */
  async profile(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentProgressService.profile(requireAuthUser(req), id));
  },

  async homework(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentProgressService.homework(requireAuthUser(req), id));
  },

  async exams(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentProgressService.exams(requireAuthUser(req), id));
  },

  /** Filtrlangan ro‘yxatni CSV yoki XLSX ga eksport qilish */
  async export(req: Request, res: Response): Promise<void> {
    const query = studentListQuerySchema.parse(req.query);
    const format = exportFormatSchema.parse(req.query.format);
    sendTable(res, await studentService.exportTable(requireAuthUser(req), query), `oquvchilar-${businessDateString(new Date())}`, format);
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = studentListQuerySchema.parse(req.query);
    const { items, total } = await studentService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    const query = studentListQuerySchema.parse(req.query);
    sendSuccess(res, await studentService.summary(requireAuthUser(req), query));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createStudentSchema.parse(req.body);
    sendCreated(res, await studentService.create(requireAuthUser(req), input, getClientInfo(req)), 'O‘quvchi qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateStudentSchema.parse(req.body);
    sendSuccess(res, await studentService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'O‘quvchi saqlandi',
    });
  },

  async groupHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentService.groupHistory(requireAuthUser(req), id));
  },

  async transferGroup(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = transferStudentGroupSchema.parse(req.body);
    sendSuccess(res, await studentService.transferGroup(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: input.groupId ? 'O‘quvchi guruhga o‘tkazildi' : 'O‘quvchi guruhdan chiqarildi',
    });
  },

  async statusHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await studentService.statusHistory(requireAuthUser(req), id));
  },

  async risk(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const actor = requireAuthUser(req);
    // Ko'rish huquqi tekshirilishi uchun avval o'quvchi olinadi
    await studentService.getById(actor, id);
    sendSuccess(res, await studentRiskService.forStudent(id));
  },

  async atRisk(req: Request, res: Response): Promise<void> {
    const query = atRiskQuerySchema.parse(req.query);
    sendSuccess(res, await studentService.atRisk(requireAuthUser(req), query));
  },

  async setStatus(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateStudentStatusSchema.parse(req.body);
    sendSuccess(res, await studentService.setStatus(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Holat yangilandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await studentService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'O‘quvchi o‘chirildi' });
  },

  async convertLead(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = convertLeadSchema.parse(req.body);
    sendCreated(
      res,
      await studentService.convertFromLead(requireAuthUser(req), id, input, getClientInfo(req)),
      'Lead o‘quvchiga aylantirildi',
    );
  },

  async attendanceHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await attendanceService.studentHistory(requireAuthUser(req), id));
  },
};
