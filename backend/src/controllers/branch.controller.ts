import type { Request, Response } from 'express';
import { branchService } from '../services/branch.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { branchListQuerySchema, createBranchSchema, updateBranchSchema } from '../validators/branch.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export const branchController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = branchListQuerySchema.parse(req.query);
    sendSuccess(res, await branchService.list(requireAuthUser(req), query));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createBranchSchema.parse(req.body);
    sendCreated(res, await branchService.create(requireAuthUser(req), input, getClientInfo(req)), 'Filial qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateBranchSchema.parse(req.body);
    sendSuccess(res, await branchService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Filial saqlandi',
    });
  },
};
