import type { Request, Response } from 'express';
import { rubricService } from '../services/rubric.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { rubricSchema, updateRubricSchema } from '../validators/homework.validator.js';

export const rubricController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await rubricService.list(req.query.includeInactive === 'true'));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = rubricSchema.parse(req.body);
    sendCreated(res, await rubricService.create(requireAuthUser(req), input, getClientInfo(req)), 'Rubrika yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateRubricSchema.parse(req.body);
    sendSuccess(res, await rubricService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Rubrika saqlandi' });
  },
};
