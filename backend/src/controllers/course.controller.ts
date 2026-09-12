import type { Request, Response } from 'express';
import { courseService } from '../services/course.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { courseListQuerySchema, createCourseSchema, updateCourseSchema } from '../validators/course.validator.js';

export const courseController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = courseListQuerySchema.parse(req.query);
    const { items, total } = await courseService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await courseService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createCourseSchema.parse(req.body);
    sendCreated(res, await courseService.create(requireAuthUser(req), input, getClientInfo(req)), 'Kurs qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateCourseSchema.parse(req.body);
    sendSuccess(res, await courseService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Kurs saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await courseService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Kurs o‘chirildi' });
  },
};
