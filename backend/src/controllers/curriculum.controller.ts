import type { Request, Response } from 'express';
import { curriculumService } from '../services/curriculum.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createModuleSchema,
  createTopicSchema,
  markTopicSchema,
  updateModuleSchema,
  updateTopicSchema,
} from '../validators/curriculum.validator.js';

export const curriculumController = {
  async forCourse(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await curriculumService.forCourse(id, req.query.includeInactive === 'true'));
  },

  async createModule(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = createModuleSchema.parse(req.body);
    sendCreated(res, await curriculumService.createModule(requireAuthUser(req), id, input, getClientInfo(req)), 'Modul qo‘shildi');
  },

  async updateModule(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateModuleSchema.parse(req.body);
    sendSuccess(res, await curriculumService.updateModule(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Modul saqlandi',
    });
  },

  async createTopic(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = createTopicSchema.parse(req.body);
    sendCreated(res, await curriculumService.createTopic(requireAuthUser(req), id, input, getClientInfo(req)), 'Mavzu qo‘shildi');
  },

  async updateTopic(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateTopicSchema.parse(req.body);
    sendSuccess(res, await curriculumService.updateTopic(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Mavzu saqlandi',
    });
  },

  /** Mavzuni o‘tilgan deb belgilash — guruh yoki tanlangan o‘quvchilar uchun */
  async markTopic(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = markTopicSchema.parse(req.body);
    const result = await curriculumService.markTopic(requireAuthUser(req), id, input, getClientInfo(req));
    sendSuccess(res, result, { message: `${result.updated} ta o‘quvchiga belgilandi` });
  },

  async studentProgress(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await curriculumService.studentProgress(id));
  },
};
