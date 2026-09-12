import type { Request, Response } from 'express';
import { groupService } from '../services/group.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createGroupSchema, groupListQuerySchema, updateGroupSchema } from '../validators/group.validator.js';

export const groupController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = groupListQuerySchema.parse(req.query);
    const { items, total } = await groupService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await groupService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createGroupSchema.parse(req.body);
    sendCreated(res, await groupService.create(requireAuthUser(req), input, getClientInfo(req)), 'Guruh yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateGroupSchema.parse(req.body);
    sendSuccess(res, await groupService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Guruh saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await groupService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Guruh o‘chirildi' });
  },
};
