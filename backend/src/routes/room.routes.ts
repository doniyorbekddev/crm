import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { roomController } from '../controllers/room.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const roomRouter = Router();

roomRouter.use(authenticate);

// Xonalar guruh jadvalining bir qismi — ruxsatlar guruh bilan bir xil
roomRouter.get('/', requirePermission(PERMISSIONS.GROUP_VIEW), roomController.list);
roomRouter.post('/', requirePermission(PERMISSIONS.GROUP_MANAGE), roomController.create);
roomRouter.put('/:id', requirePermission(PERMISSIONS.GROUP_MANAGE), roomController.update);
roomRouter.post('/conflicts', requirePermission(PERMISSIONS.GROUP_VIEW), roomController.checkConflicts);
