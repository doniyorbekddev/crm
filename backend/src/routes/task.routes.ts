import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { taskService } from '../services/task.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission, requireStaff } from '../middleware/requirePermission.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { taskAssignSchema, taskCommentSchema, taskCreateSchema, taskListQuerySchema, taskUpdateSchema } from '../validators/task.validator.js';

/**
 * Xodim vazifalari (CRM 4.0, 2-faza). Har kim o'zinikini va o'zi berganini ko'radi;
 * `task.view_all` — filiali doirasida hammasini. Doira tekshiruvi servisda.
 */
export const taskRouter = Router();

taskRouter.use(authenticate, requireStaff());

taskRouter.get('/', async (req, res) => {
  sendSuccess(res, await taskService.list(requireAuthUser(req), taskListQuerySchema.parse(req.query)));
});

taskRouter.get('/assignees', async (req, res) => {
  sendSuccess(res, await taskService.assignees(requireAuthUser(req)));
});

taskRouter.post('/', requirePermission(PERMISSIONS.TASK_CREATE), async (req, res) => {
  sendCreated(res, await taskService.create(requireAuthUser(req), taskCreateSchema.parse(req.body), getClientInfo(req)), 'Vazifa yaratildi');
});

taskRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await taskService.getById(requireAuthUser(req), id));
});

taskRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = taskUpdateSchema.parse(req.body);
  sendSuccess(res, await taskService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: input.status === 'DONE' ? 'Bajarildi' : 'Saqlandi' });
});

taskRouter.post('/:id/assign', requirePermission(PERMISSIONS.TASK_ASSIGN), async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendSuccess(res, await taskService.assign(requireAuthUser(req), id, taskAssignSchema.parse(req.body), getClientInfo(req)), { message: 'Vazifa biriktirildi' });
});

taskRouter.post('/:id/comments', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  sendCreated(res, await taskService.addComment(requireAuthUser(req), id, taskCommentSchema.parse(req.body)), 'Izoh qo‘shildi');
});
