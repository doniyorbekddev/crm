import type { Request, Response } from 'express';
import { salaryService } from '../services/salary.service.js';
import { teacherService } from '../services/teacher.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { salaryHistoryQuerySchema } from '../validators/salary.validator.js';
import {
  createSalaryRuleSchema,
  createTeacherProfileSchema,
  teacherListQuerySchema,
  updateTeacherProfileSchema,
} from '../validators/teacher.validator.js';

export const teacherController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = teacherListQuerySchema.parse(req.query);
    const { items, total } = await teacherService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async candidates(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await teacherService.candidates());
  },

  /** O‘qituvchining o‘z paneli — profil egasiga ruxsat talab qilinmaydi */
  async myTeaching(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await teacherService.myTeaching(requireAuthUser(req).id));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await teacherService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createTeacherProfileSchema.parse(req.body);
    const teacher = await teacherService.create(requireAuthUser(req), input, getClientInfo(req));
    sendCreated(res, teacher, 'O‘qituvchi profili yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTeacherProfileSchema.parse(req.body);
    sendSuccess(res, await teacherService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'O‘qituvchi profili saqlandi',
    });
  },

  async salaryRules(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await salaryService.rules(id));
  },

  async createSalaryRule(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = createSalaryRuleSchema.parse(req.body);
    const rule = await salaryService.createRule(requireAuthUser(req), id, input, getClientInfo(req));
    sendCreated(res, rule, 'Maosh modeli saqlandi');
  },

  async salaryHistory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const query = salaryHistoryQuerySchema.parse(req.query);
    sendSuccess(res, await salaryService.history(id, query));
  },
};
