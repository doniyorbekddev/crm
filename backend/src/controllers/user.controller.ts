import type { Request, Response } from 'express';
import { userService } from '../services/user.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createUserSchema,
  resetUserPasswordSchema,
  updateUserSchema,
  updateUserStatusSchema,
  userListQuerySchema,
  userSummaryQuerySchema,
} from '../validators/user.validator.js';

export const userController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = userListQuerySchema.parse(req.query);
    const { items, total } = await userService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    const filters = userSummaryQuerySchema.parse(req.query);
    sendSuccess(res, await userService.summary(filters));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await userService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const input = createUserSchema.parse(req.body);
    sendCreated(res, await userService.create(actor, input, getClientInfo(req)), 'Xodim qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    sendSuccess(res, await userService.update(actor, id, input, getClientInfo(req)), {
      message: 'Xodim ma’lumotlari saqlandi',
    });
  },

  async setStatus(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    const input = updateUserStatusSchema.parse(req.body);
    const user = await userService.setStatus(actor, id, input, getClientInfo(req));
    sendSuccess(res, user, {
      message: input.status === 'BLOCKED' ? 'Xodim bloklandi va barcha sessiyalari yopildi' : 'Xodim faollashtirildi',
    });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    const input = resetUserPasswordSchema.parse(req.body);
    await userService.resetPassword(actor, id, input, getClientInfo(req));
    sendSuccess(res, null, { message: 'Parol yangilandi. Xodimning barcha sessiyalari yopildi' });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    await userService.remove(actor, id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Xodim o‘chirildi' });
  },
};
