import type { Request, Response } from 'express';
import { parentService } from '../services/parent.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createParentSchema,
  linkStudentSchema,
  parentListQuerySchema,
  updateLinkSchema,
  updateParentSchema,
} from '../validators/parent.validator.js';

const linkParamSchema = idParamSchema;

export const parentController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = parentListQuerySchema.parse(req.query);
    const { items, total } = await parentService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await parentService.getById(requireAuthUser(req), id));
  },

  async forStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await parentService.forStudent(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createParentSchema.parse(req.body);
    sendCreated(res, await parentService.create(requireAuthUser(req), input, getClientInfo(req)), 'Ota-ona qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateParentSchema.parse(req.body);
    sendSuccess(res, await parentService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Ota-ona saqlandi' });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await parentService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, { id }, { message: 'Ota-ona o‘chirildi' });
  },

  async linkStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = linkStudentSchema.parse(req.body);
    sendSuccess(res, await parentService.linkStudent(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Farzand biriktirildi',
    });
  },

  async updateLink(req: Request, res: Response): Promise<void> {
    const { id } = linkParamSchema.parse({ id: req.params.linkId });
    const input = updateLinkSchema.parse(req.body);
    sendSuccess(res, await parentService.updateLink(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Saqlandi' });
  },

  async unlink(req: Request, res: Response): Promise<void> {
    const { id } = linkParamSchema.parse({ id: req.params.linkId });
    sendSuccess(res, await parentService.unlink(requireAuthUser(req), id, getClientInfo(req)), { message: 'Farzand ajratildi' });
  },
};
