import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { callController } from '../controllers/call.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const callRouter = Router();

callRouter.use(authenticate);

callRouter.get('/', requirePermission(PERMISSIONS.CALL_VIEW), callController.list);
callRouter.post('/', requirePermission(PERMISSIONS.CALL_CREATE), callController.create);
callRouter.put('/:id', requirePermission(PERMISSIONS.CALL_UPDATE), callController.update);
callRouter.delete('/:id', requirePermission(PERMISSIONS.CALL_DELETE), callController.remove);
