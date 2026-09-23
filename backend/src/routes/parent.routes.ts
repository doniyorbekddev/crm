import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { parentController } from '../controllers/parent.controller.js';
import { portalController } from '../controllers/portal.controller.js';
import { telegramController } from '../controllers/telegram.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const parentRouter = Router();

parentRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.PARENT_VIEW);
const manage = requirePermission(PERMISSIONS.PARENT_MANAGE);

parentRouter.get('/', view, parentController.list);
parentRouter.get('/:id', view, parentController.getById);
parentRouter.post('/', manage, parentController.create);
parentRouter.put('/:id', manage, parentController.update);
parentRouter.delete('/:id', manage, parentController.remove);
parentRouter.post('/:id/students', manage, parentController.linkStudent);
parentRouter.get(
  '/:id/telegram-link',
  requirePermission(PERMISSIONS.PORTAL_MANAGE),
  telegramController.linkForParent,
);
parentRouter.post(
  '/:id/portal-account',
  requirePermission(PERMISSIONS.PORTAL_MANAGE),
  portalController.createParentAccount,
);
parentRouter.patch('/links/:linkId', manage, parentController.updateLink);
parentRouter.delete('/links/:linkId', manage, parentController.unlink);
