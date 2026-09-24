import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { inventoryController } from '../controllers/inventory.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.INVENTORY_VIEW);
const manage = requirePermission(PERMISSIONS.INVENTORY_MANAGE);

// Aniq yo'llar avval
inventoryRouter.get('/categories', view, inventoryController.categories);
inventoryRouter.put('/categories', manage, inventoryController.saveCategory);
inventoryRouter.get('/stats', view, inventoryController.stats);
inventoryRouter.get('/movements', view, inventoryController.movements);
inventoryRouter.post('/movements', manage, inventoryController.move);
inventoryRouter.post('/transfers', manage, inventoryController.transfer);
inventoryRouter.get('/', view, inventoryController.list);
inventoryRouter.put('/', manage, inventoryController.save);
