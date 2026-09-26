import type { Request, Response } from 'express';
import { recurringHomeworkService } from '../services/recurringHomework.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createRecurringHomeworkSchema, recurringListQuerySchema, updateRecurringHomeworkSchema } from '../validators/recurringHomework.validator.js';

/** Takrorlanuvchi uy vazifasi (TZ 3.1 GAP-18) */
export const recurringHomeworkController = {
  async list(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await recurringHomeworkService.list(requireAuthUser(req), recurringListQuerySchema.parse(req.query)));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createRecurringHomeworkSchema.parse(req.body);
    sendCreated(res, await recurringHomeworkService.create(requireAuthUser(req), input, getClientInfo(req)), 'Takrorlanuvchi vazifa yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateRecurringHomeworkSchema.parse(req.body);
    sendSuccess(res, await recurringHomeworkService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Saqlandi' });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await recurringHomeworkService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Jadval o‘chirildi — yaratilgan vazifalar qoldi' });
  },
};
