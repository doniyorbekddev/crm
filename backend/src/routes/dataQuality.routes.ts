import { Router } from 'express';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { dataQualityService } from '../services/dataQuality.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';

/** Ma'lumotlar sifati — faqat o'qiydi; o'quvchilarni boshqaradigan xodimlar uchun (filial doirasida) */
export const dataQualityRouter = Router();

dataQualityRouter.use(authenticate);

dataQualityRouter.get('/', requirePermission(PERMISSIONS.STUDENT_MANAGE), async (req: Request, res: Response) => {
  sendSuccess(res, await dataQualityService.report(requireAuthUser(req)));
});
