import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { examController, homeworkController } from '../controllers/homework.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const homeworkRouter = Router();

homeworkRouter.use(authenticate);

const homeworkView = requirePermission(PERMISSIONS.HOMEWORK_VIEW);
const homeworkManage = requirePermission(PERMISSIONS.HOMEWORK_MANAGE);
const homeworkGrade = requirePermission(PERMISSIONS.HOMEWORK_GRADE);

homeworkRouter.get('/', homeworkView, homeworkController.list);
homeworkRouter.get('/:id', homeworkView, homeworkController.getById);
homeworkRouter.post('/', homeworkManage, homeworkController.create);
homeworkRouter.put('/:id', homeworkManage, homeworkController.update);
homeworkRouter.delete('/:id', homeworkManage, homeworkController.remove);
homeworkRouter.put('/:id/submissions', homeworkGrade, homeworkController.bulkGrade);
homeworkRouter.patch('/:id/submissions/:studentId', homeworkGrade, homeworkController.grade);

export const examRouter = Router();

examRouter.use(authenticate);

const examView = requirePermission(PERMISSIONS.EXAM_VIEW);
const examManage = requirePermission(PERMISSIONS.EXAM_MANAGE);
const examGrade = requirePermission(PERMISSIONS.EXAM_GRADE);

examRouter.get('/', examView, examController.list);
examRouter.get('/:id', examView, examController.getById);
examRouter.post('/', examManage, examController.create);
examRouter.put('/:id', examManage, examController.update);
examRouter.delete('/:id', examManage, examController.remove);
examRouter.put('/:id/results', examGrade, examController.saveResults);
