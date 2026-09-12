import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { roleController } from '../controllers/role.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../middleware/requirePermission.js';

export const roleRouter = Router();

roleRouter.use(authenticate);

// Rollar ro‘yxati xodimlar sahifasidagi filtr va formalar uchun ham kerak
roleRouter.get('/', requireAnyPermission(PERMISSIONS.USER_VIEW, PERMISSIONS.ROLE_MANAGE), roleController.list);
roleRouter.post('/', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.create);
roleRouter.put('/:id', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.update);
roleRouter.put('/:id/permissions', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.setPermissions);
roleRouter.delete('/:id', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.remove);

export const permissionRouter = Router();

permissionRouter.use(authenticate);
permissionRouter.get('/', requirePermission(PERMISSIONS.ROLE_MANAGE), roleController.listPermissions);
