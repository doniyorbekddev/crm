import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireStaff } from '../middleware/requirePermission.js';
import { myWorkService } from '../services/myWork.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requireAuthUser } from '../utils/requestContext.js';

/** "Ishlarim" markazi — har bo'lim servisda o'z ruxsati bilan ochiladi; faqat xodimning o'z ishlari */
export const myWorkRouter = Router();

myWorkRouter.use(authenticate, requireStaff());

myWorkRouter.get('/', async (req, res) => {
  sendSuccess(res, await myWorkService.get(requireAuthUser(req)));
});
