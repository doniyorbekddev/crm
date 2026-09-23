import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import { branchController } from '../controllers/branch.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/requirePermission.js';

export const branchRouter = Router();

branchRouter.use(authenticate);

// Ro'yxat har bir kirgan xodimga ochiq: u faqat o'zi ko'ra oladigan filiallarni oladi
// (branch.view_all bo'lmasa — bitta o'z filiali). Filial tanlash paneli shunga tayanadi.
branchRouter.get('/', branchController.list);
branchRouter.post('/', requirePermission(PERMISSIONS.BRANCH_MANAGE), branchController.create);
branchRouter.put('/:id', requirePermission(PERMISSIONS.BRANCH_MANAGE), branchController.update);
