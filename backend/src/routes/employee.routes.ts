import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { attachmentController } from '../controllers/document.controller.js';
import { employeeController } from '../controllers/employee.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';

export const employeeRouter = Router();

employeeRouter.use(authenticate);

const view = requirePermission(PERMISSIONS.EMPLOYEE_VIEW);
const manage = requirePermission(PERMISSIONS.EMPLOYEE_MANAGE);

employeeRouter.get('/', view, employeeController.list);
employeeRouter.get('/candidates', manage, employeeController.candidates);
employeeRouter.get('/:id', view, employeeController.getById);
employeeRouter.post('/', manage, employeeController.create);
employeeRouter.put('/:id', manage, employeeController.update);
const employeeDocuments = attachmentController('employee');
employeeRouter.get('/:id/documents', requirePermission(PERMISSIONS.STAFF_DOCUMENT_VIEW), employeeDocuments.list);
employeeRouter.post(
  '/:id/documents',
  requirePermission(PERMISSIONS.STAFF_DOCUMENT_MANAGE),
  heavyLimiter,
  uploadBody,
  employeeDocuments.upload,
);
