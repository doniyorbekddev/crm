import type { Request, Response } from 'express';
import { employeeService } from '../services/employee.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createEmployeeSchema, employeeListQuerySchema, updateEmployeeSchema } from '../validators/employee.validator.js';

export const employeeController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = employeeListQuerySchema.parse(req.query);
    const { items, total } = await employeeService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async candidates(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await employeeService.candidates());
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await employeeService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createEmployeeSchema.parse(req.body);
    sendCreated(res, await employeeService.create(requireAuthUser(req), input, getClientInfo(req)), 'Xodim qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateEmployeeSchema.parse(req.body);
    sendSuccess(res, await employeeService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Xodim saqlandi' });
  },
};
