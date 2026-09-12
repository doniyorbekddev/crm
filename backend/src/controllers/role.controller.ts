import type { Request, Response } from 'express';
import { roleService } from '../services/role.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createRoleSchema, setRolePermissionsSchema, updateRoleSchema } from '../validators/role.validator.js';

export const roleController = {
  async list(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await roleService.list());
  },

  async listPermissions(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await roleService.listPermissions());
  },

  async create(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const input = createRoleSchema.parse(req.body);
    sendCreated(res, await roleService.create(actor, input, getClientInfo(req)), 'Rol yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    const input = updateRoleSchema.parse(req.body);
    sendSuccess(res, await roleService.update(actor, id, input, getClientInfo(req)), { message: 'Rol saqlandi' });
  },

  async setPermissions(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    const input = setRolePermissionsSchema.parse(req.body);
    sendSuccess(res, await roleService.setPermissions(actor, id, input, getClientInfo(req)), {
      message: 'Ruxsatlar saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const actor = requireAuthUser(req);
    const { id } = idParamSchema.parse(req.params);
    await roleService.remove(actor, id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Rol o‘chirildi' });
  },
};
