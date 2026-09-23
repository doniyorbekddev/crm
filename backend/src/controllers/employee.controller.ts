import type { Request, Response } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { employeeService } from '../services/employee.service.js';
import { permissionService } from '../services/permission.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  createEmployeeSchema,
  createLeaveSchema,
  decideLeaveSchema,
  employeeListQuerySchema,
  leaveListQuerySchema,
  updateEmployeeSchema,
} from '../validators/employee.validator.js';
import { employeeLeaveService } from '../services/employeeLeave.service.js';

/** Maosh summalari faqat salary.view, maxfiy ma'lumot faqat employee.sensitive egasiga */
async function visibility(req: Request): Promise<{ salary: boolean; sensitive: boolean }> {
  const permissions = await permissionService.getRolePermissions(requireAuthUser(req).roleId);
  return { salary: permissions.has(PERMISSIONS.SALARY_VIEW), sensitive: permissions.has(PERMISSIONS.EMPLOYEE_SENSITIVE) };
}

export const leaveController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = leaveListQuerySchema.parse(req.query);
    const { items, total } = await employeeLeaveService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async forEmployee(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await employeeLeaveService.forEmployee(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createLeaveSchema.parse(req.body);
    sendCreated(res, await employeeLeaveService.create(requireAuthUser(req), input, getClientInfo(req)), 'Ta’til arizasi qo‘shildi');
  },

  async decide(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = decideLeaveSchema.parse(req.body);
    const messages = { APPROVED: 'Ta’til tasdiqlandi', REJECTED: 'Ariza rad etildi', CANCELLED: 'Ta’til bekor qilindi' } as const;
    sendSuccess(res, await employeeLeaveService.decide(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: messages[input.status],
    });
  },
};

export const employeeController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = employeeListQuerySchema.parse(req.query);
    const can = await visibility(req);
    const { items, total } = await employeeService.list(query, can.salary, can.sensitive);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async candidates(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await employeeService.candidates());
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const can = await visibility(req);
    sendSuccess(res, await employeeService.getById(id, can.salary, can.sensitive));
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
