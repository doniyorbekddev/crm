import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { orgStructureService } from '../services/org/structure.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';

/** ORG tizimi: tashkiliy tuzilma */
export const orgRouter = Router();

orgRouter.use(authenticate);

orgRouter.get('/structure', requirePermission(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgStructureService.get(requireAuthUser(req)));
});

orgRouter.get('/people', requirePermission(PERMISSIONS.EMPLOYEE_VIEW), async (req, res) => {
  sendSuccess(res, await orgStructureService.people(requireAuthUser(req)));
});
