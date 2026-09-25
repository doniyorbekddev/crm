import { Router } from 'express';
import { z } from 'zod';
import { taskService } from '../services/task.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireStaff } from '../middleware/requirePermission.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';

/** Xodim ishlari (TZ §51) — har kim o'zinikini; rahbar hammasini (`scope=all`) */
export const taskRouter = Router();

taskRouter.use(authenticate, requireStaff());

const listQuery = z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']).optional(), scope: z.enum(['mine', 'all']).optional() });
const statusBody = z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELLED'], 'Holat noto‘g‘ri') });

taskRouter.get('/', async (req, res) => {
  sendSuccess(res, await taskService.list(requireAuthUser(req), listQuery.parse(req.query)));
});

taskRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { status } = statusBody.parse(req.body);
  sendSuccess(res, await taskService.setStatus(requireAuthUser(req), id, status, getClientInfo(req)), { message: status === 'DONE' ? 'Bajarildi' : 'Saqlandi' });
});
