import { Router } from 'express';
import { PERMISSIONS } from '../config/permissions.js';
import {
  budgetController,
  expenseController,
  financeController,
  incomeController,
} from '../controllers/finance.controller.js';
import { attachmentController } from '../controllers/document.controller.js';
import { expenseWorkflowController } from '../controllers/expenseWorkflow.controller.js';
import { financialPeriodController } from '../controllers/financialPeriod.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { heavyLimiter } from '../middleware/rateLimiter.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { uploadBody } from './document.routes.js';

const financeView = requirePermission(PERMISSIONS.FINANCE_VIEW);
const financeManage = requirePermission(PERMISSIONS.FINANCE_MANAGE);

export const financeRouter = Router();

financeRouter.use(authenticate);

financeRouter.get('/summary', financeView, financeController.summary);
financeRouter.get('/cash-flow', financeView, financeController.cashFlow);
financeRouter.get('/cash-flow/statement', financeView, financeController.cashFlowStatement);
financeRouter.get('/profit-loss', financeView, financeController.profitLoss);
financeRouter.get('/accounts', financeView, financeController.accounts);
financeRouter.post('/accounts', financeManage, financeController.createAccount);
financeRouter.put('/accounts/:id', financeManage, financeController.updateAccount);
financeRouter.get('/transactions', financeView, financeController.transactions);
financeRouter.post('/transfers', financeManage, financeController.transfer);
financeRouter.post('/transactions/:id/void', financeManage, financeController.voidTransaction);

financeRouter.get('/periods', financeView, financialPeriodController.list);
financeRouter.post('/periods/close', requirePermission(PERMISSIONS.FINANCE_CLOSE), financialPeriodController.close);
financeRouter.post('/periods/reopen', requirePermission(PERMISSIONS.FINANCE_REOPEN), financialPeriodController.reopen);

financeRouter.get('/budget', financeView, budgetController.get);
financeRouter.put('/budget', requirePermission(PERMISSIONS.BUDGET_MANAGE), budgetController.save);
financeRouter.post('/budget/copy', requirePermission(PERMISSIONS.BUDGET_MANAGE), budgetController.copy);

export const incomeRouter = Router();

incomeRouter.use(authenticate);

const incomeView = requirePermission(PERMISSIONS.INCOME_VIEW);
const incomeManage = requirePermission(PERMISSIONS.INCOME_MANAGE);

incomeRouter.get('/', incomeView, incomeController.list);
incomeRouter.get('/stats', incomeView, incomeController.stats);
incomeRouter.get('/categories', incomeView, incomeController.categories);
incomeRouter.post('/', incomeManage, incomeController.create);
incomeRouter.post('/categories', incomeManage, incomeController.createCategory);
incomeRouter.put('/categories/:id', incomeManage, incomeController.updateCategory);
incomeRouter.post('/:id/void', incomeManage, incomeController.void);
const incomeAttachments = attachmentController('income');
incomeRouter.get('/:id/attachments', incomeView, incomeAttachments.list);
incomeRouter.post('/:id/attachments', incomeManage, heavyLimiter, uploadBody, incomeAttachments.upload);

export const expenseRouter = Router();

expenseRouter.use(authenticate);

const expenseView = requirePermission(PERMISSIONS.EXPENSE_VIEW);
const expenseManage = requirePermission(PERMISSIONS.EXPENSE_MANAGE);

expenseRouter.get('/', expenseView, expenseController.list);
expenseRouter.get('/stats', expenseView, expenseController.stats);
expenseRouter.get('/categories', expenseView, expenseController.categories);
expenseRouter.post('/', expenseManage, expenseController.create);
expenseRouter.post('/categories', expenseManage, expenseController.createCategory);
expenseRouter.put('/categories/:id', expenseManage, expenseController.updateCategory);
expenseRouter.post('/:id/void', expenseManage, expenseController.void);
expenseRouter.get('/settings/approval', expenseView, expenseWorkflowController.settings);
expenseRouter.put('/settings/approval', requirePermission(PERMISSIONS.EXPENSE_APPROVE), expenseWorkflowController.updateSettings);
expenseRouter.post('/:id/approve', requirePermission(PERMISSIONS.EXPENSE_APPROVE), expenseWorkflowController.approve);
expenseRouter.post('/:id/reject', expenseManage, expenseWorkflowController.reject);
expenseRouter.post('/:id/pay', expenseManage, expenseWorkflowController.pay);
const expenseAttachments = attachmentController('expense');
expenseRouter.get('/:id/attachments', expenseView, expenseAttachments.list);
expenseRouter.post('/:id/attachments', expenseManage, heavyLimiter, uploadBody, expenseAttachments.upload);
