import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { examController, homeworkController } from '../controllers/homework.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { questionController } from '../controllers/question.controller.js';
import { rubricController } from '../controllers/rubric.controller.js';
import { uploadBody } from './document.routes.js';

export const homeworkRouter = Router();

homeworkRouter.use(authenticate);

const homeworkView = requirePermission(PERMISSIONS.HOMEWORK_VIEW);
const homeworkManage = requirePermission(PERMISSIONS.HOMEWORK_MANAGE);
const homeworkGrade = requirePermission(PERMISSIONS.HOMEWORK_GRADE);

homeworkRouter.get('/', homeworkView, homeworkController.list);
homeworkRouter.get('/attachments/:id/download', homeworkView, homeworkController.downloadAttachment);
homeworkRouter.delete('/attachments/:id', homeworkManage, homeworkController.removeAttachment);
homeworkRouter.get('/:id', homeworkView, homeworkController.getById);
homeworkRouter.post('/', homeworkManage, homeworkController.create);
homeworkRouter.put('/:id', homeworkManage, homeworkController.update);
homeworkRouter.delete('/:id', homeworkManage, homeworkController.remove);
homeworkRouter.put('/:id/submissions', homeworkGrade, homeworkController.bulkGrade);
homeworkRouter.patch('/:id/submissions/:studentId', homeworkGrade, homeworkController.grade);
homeworkRouter.get('/:id/submissions/:studentId', homeworkView, homeworkController.submission);
homeworkRouter.get('/:id/submissions/:studentId/files/:fileId', homeworkView, homeworkController.submissionFile);
homeworkRouter.post('/:id/submissions/:studentId/return', homeworkGrade, homeworkController.returnSubmission);
homeworkRouter.post('/:id/attachments', homeworkManage, homeworkController.addLink);
homeworkRouter.post('/:id/attachments/upload', homeworkManage, uploadBody, homeworkController.uploadAttachment);

/** Baholash mezonlari (TZ §20): ko'rish — vazifani ko'ruvchi, yaratish — vazifa beruvchi */
export const rubricRouter = Router();
rubricRouter.use(authenticate);
rubricRouter.get('/', homeworkView, rubricController.list);
rubricRouter.post('/', homeworkManage, rubricController.create);
rubricRouter.put('/:id', homeworkManage, rubricController.update);

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

// --- Imtihon dvigateli (savollar bazasi, urinishlar) ---
examRouter.post('/:id/questions', requirePermission(PERMISSIONS.EXAM_MANAGE), questionController.attachToExam);
examRouter.get('/:id/questions', requirePermission(PERMISSIONS.EXAM_VIEW), questionController.examQuestions);
examRouter.post('/:id/attempts/:studentId/start', requirePermission(PERMISSIONS.EXAM_GRADE), questionController.startAttempt);
examRouter.post('/:id/attempts/:studentId', requirePermission(PERMISSIONS.EXAM_GRADE), questionController.submitAttempt);
examRouter.get('/:id/attempts', requirePermission(PERMISSIONS.EXAM_VIEW), questionController.attempts);
examRouter.get('/attempts/:id', requirePermission(PERMISSIONS.EXAM_VIEW), questionController.attempt);
examRouter.post('/attempts/:id/grade', requirePermission(PERMISSIONS.EXAM_GRADE), questionController.gradeAttempt);
