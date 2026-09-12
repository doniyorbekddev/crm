import type { Request, Response } from 'express';
import { callService } from '../services/call.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { callListQuerySchema, createCallSchema, updateCallSchema } from '../validators/call.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const callController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = callListQuerySchema.parse(req.query);
    const { items, total } = await callService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createCallSchema.parse(req.body);
    sendCreated(res, await callService.create(requireAuthUser(req), input, getClientInfo(req)), 'Qo‘ng‘iroq yozildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateCallSchema.parse(req.body);
    sendSuccess(res, await callService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Qo‘ng‘iroq saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await callService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Qo‘ng‘iroq o‘chirildi' });
  },
};
