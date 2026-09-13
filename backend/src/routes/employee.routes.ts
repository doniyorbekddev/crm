import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { employeeController } from '../controllers/employee.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const employeeRouter = Router();

employeeRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.EMPLOYEE_VIEW);
const manage = requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);

employeeRouter.get('/', view, employeeController.list);
employeeRouter.get('/candidates', manage, employeeController.candidates);
employeeRouter.get('/:id', view, employeeController.getById);
employeeRouter.post('/', manage, employeeController.create);
employeeRouter.put('/:id', manage, employeeController.update);
