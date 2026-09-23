import type { Request, Response } from 'express';
import { feedbackService } from '../services/feedback.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createFeedbackSchema,
  feedbackListQuerySchema,
  feedbackStatsQuerySchema,
  handleFeedbackSchema,
} from '../validators/feedback.validator.js';

export const feedbackController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = feedbackListQuerySchema.parse(req.query);
    const { items, total } = await feedbackService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const query = feedbackStatsQuerySchema.parse(req.query);
    const from = query.months ? new Date(Date.now() - query.months * 30 * 86_400_000) : undefined;
    sendSuccess(res, await feedbackService.stats({ teacherId: query.teacherId, from }));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createFeedbackSchema.parse(req.body);
    const actor = requireAuthUser(req);
    sendCreated(res, await feedbackService.create(input, { actor, client: getClientInfo(req) }), 'Fikr saqlandi');
  },

  async handle(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { note } = handleFeedbackSchema.parse(req.body);
    sendSuccess(res, await feedbackService.markHandled(requireAuthUser(req), id, note, getClientInfo(req)), {
      message: 'Fikr ishlangan deb belgilandi',
    });
  },
};
