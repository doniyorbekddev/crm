import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { recurringExpenseController } from '../controllers/expenseWorkflow.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const recurringExpenseRouter = Router();

recurringExpenseRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.EXPENSE_VIEW);
const manage = requirePermission(PERMISSIONS.EXPENSE_MANAGE);

recurringExpenseRouter.get('/', view, recurringExpenseController.list);
recurringExpenseRouter.post('/', manage, recurringExpenseController.create);
recurringExpenseRouter.post('/generate', manage, recurringExpenseController.generate);
recurringExpenseRouter.put('/:id', manage, recurringExpenseController.update);
