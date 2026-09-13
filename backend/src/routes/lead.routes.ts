import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { leadController } from '../controllers/lead.controller.js';
import { studentController } from '../controllers/student.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';

export const leadRouter = Router();

leadRouter.use(authenticate);

leadRouter.get('/', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.list);
leadRouter.get('/summary', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.summary);
leadRouter.get('/export', heavyLimiter, requirePermission(PERMISSIONS.LEAD_VIEW), requirePermission(PERMISSIONS.REPORT_EXPORT), leadController.export);
leadRouter.get('/kanban', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.kanban);
leadRouter.post('/', requirePermission(PERMISSIONS.LEAD_CREATE), leadController.create);
leadRouter.get('/:id', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.getById);
leadRouter.put('/:id', requirePermission(PERMISSIONS.LEAD_UPDATE), leadController.update);
leadRouter.patch('/:id/status', requirePermission(PERMISSIONS.LEAD_UPDATE), leadController.setStatus);
leadRouter.patch('/:id/assign', requirePermission(PERMISSIONS.LEAD_ASSIGN), leadController.assign);
leadRouter.delete('/:id', requirePermission(PERMISSIONS.LEAD_DELETE), leadController.remove);

leadRouter.post('/:id/convert', requirePermission(PERMISSIONS.STUDENT_CONVERT), studentController.convertLead);

leadRouter.get('/:id/activities', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.activities);
leadRouter.get('/:id/notes', requirePermission(PERMISSIONS.LEAD_VIEW), leadController.notes);
leadRouter.post('/:id/notes', requirePermission(PERMISSIONS.LEAD_UPDATE), leadController.addNote);
leadRouter.delete('/:id/notes/:noteId', requirePermission(PERMISSIONS.LEAD_UPDATE), leadController.deleteNote);
