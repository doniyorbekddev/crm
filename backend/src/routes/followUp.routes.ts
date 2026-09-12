import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { followUpController } from '../controllers/followUp.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const followUpRouter = Router();

followUpRouter.use(authenticate);

followUpRouter.get('/', requirePermission(PERMISSIONS.FOLLOWUP_VIEW), followUpController.list);
followUpRouter.get('/summary', requirePermission(PERMISSIONS.FOLLOWUP_VIEW), followUpController.summary);
followUpRouter.post('/', requirePermission(PERMISSIONS.FOLLOWUP_CREATE), followUpController.create);
followUpRouter.put('/:id', requirePermission(PERMISSIONS.FOLLOWUP_UPDATE), followUpController.update);
followUpRouter.patch('/:id/complete', requirePermission(PERMISSIONS.FOLLOWUP_UPDATE), followUpController.complete);
followUpRouter.delete('/:id', requirePermission(PERMISSIONS.FOLLOWUP_DELETE), followUpController.remove);
