import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { userController } from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const userRouter = Router();

userRouter.use(authenticate);

userRouter.get('/', requirePermission(PERMISSIONS.USER_VIEW), userController.list);
userRouter.get('/summary', requirePermission(PERMISSIONS.USER_VIEW), userController.summary);
userRouter.get('/:id', requirePermission(PERMISSIONS.USER_VIEW), userController.getById);
userRouter.post('/', requirePermission(PERMISSIONS.USER_MANAGE), userController.create);
userRouter.put('/:id', requirePermission(PERMISSIONS.USER_MANAGE), userController.update);
userRouter.patch('/:id/status', requirePermission(PERMISSIONS.USER_MANAGE), userController.setStatus);
userRouter.patch('/:id/password', requirePermission(PERMISSIONS.USER_MANAGE), userController.resetPassword);
userRouter.delete('/:id', requirePermission(PERMISSIONS.USER_MANAGE), userController.remove);
