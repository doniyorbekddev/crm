import type { Request, Response } from 'express';
import { followUpService } from '../services/followUp.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  completeFollowUpSchema,
  createFollowUpSchema,
  followUpListQuerySchema,
  followUpSummaryQuerySchema,
  updateFollowUpSchema,
} from '../validators/followUp.validator.js';

export const followUpController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = followUpListQuerySchema.parse(req.query);
    const { items, total } = await followUpService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async summary(req: Request, res: Response): Promise<void> {
    const filters = followUpSummaryQuerySchema.parse(req.query);
    sendSuccess(res, await followUpService.summary(requireAuthUser(req), filters));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createFollowUpSchema.parse(req.body);
    sendCreated(res, await followUpService.create(requireAuthUser(req), input, getClientInfo(req)), 'Follow-up yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateFollowUpSchema.parse(req.body);
    sendSuccess(res, await followUpService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Follow-up saqlandi',
    });
  },

  async complete(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = completeFollowUpSchema.parse(req.body);
    sendSuccess(res, await followUpService.complete(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Follow-up bajarildi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await followUpService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Follow-up o‘chirildi' });
  },
};
