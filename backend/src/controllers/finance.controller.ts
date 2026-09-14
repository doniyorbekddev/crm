import type { Request, Response } from 'express';
import { financeService } from '../services/finance.service.js';
import {
  budgetService,
  expenseService,
  financeCategoryService,
  incomeService,
} from '../services/incomeExpense.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  accountSchema,
  cashFlowQuerySchema,
  financeRangeQuerySchema,
  transactionListQuerySchema,
  transferSchema,
  updateAccountSchema,
  voidTransactionSchema,
} from '../validators/finance.validator.js';
import {
  budgetQuerySchema,
  categorySchema,
  createExpenseSchema,
  createIncomeSchema,
  moneyListQuerySchema,
  saveBudgetSchema,
  updateCategorySchema,
  voidMoneySchema,
} from '../validators/incomeExpense.validator.js';

export const financeController = {
  async summary(req: Request, res: Response): Promise<void> {
    const query = financeRangeQuerySchema.parse(req.query);
    sendSuccess(res, await financeService.summary(query));
  },

  async cashFlow(req: Request, res: Response): Promise<void> {
    const query = cashFlowQuerySchema.parse(req.query);
    sendSuccess(res, await financeService.cashFlow(query));
  },

  async profitLoss(req: Request, res: Response): Promise<void> {
    const query = financeRangeQuerySchema.parse(req.query);
    sendSuccess(res, await financeService.profitLoss(query));
  },

  async cashFlowStatement(req: Request, res: Response): Promise<void> {
    const query = financeRangeQuerySchema.parse(req.query);
    sendSuccess(res, await financeService.cashFlowStatement(query));
  },

  async accounts(req: Request, res: Response): Promise<void> {
    const query = financeRangeQuerySchema.parse(req.query);
    sendSuccess(res, await financeService.accounts(query));
  },

  async createAccount(req: Request, res: Response): Promise<void> {
    const input = accountSchema.parse(req.body);
    sendCreated(res, await financeService.createAccount(requireAuthUser(req), input, getClientInfo(req)), 'Hisob qo‘shildi');
  },

  async updateAccount(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateAccountSchema.parse(req.body);
    sendSuccess(res, await financeService.updateAccount(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Hisob saqlandi',
    });
  },

  async transactions(req: Request, res: Response): Promise<void> {
    const query = transactionListQuerySchema.parse(req.query);
    const { items, total } = await financeService.transactions(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async transfer(req: Request, res: Response): Promise<void> {
    const input = transferSchema.parse(req.body);
    sendCreated(res, await financeService.transfer(requireAuthUser(req), input, getClientInfo(req)), 'O‘tkazma bajarildi');
  },

  async voidTransaction(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = voidTransactionSchema.parse(req.body);
    sendSuccess(res, await financeService.voidTransaction(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Yozuv bekor qilindi',
    });
  },
};

export const incomeController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = moneyListQuerySchema.parse(req.query);
    const { items, total } = await incomeService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const query = moneyListQuerySchema.parse(req.query);
    sendSuccess(res, await incomeService.stats(query));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createIncomeSchema.parse(req.body);
    sendCreated(res, await incomeService.create(requireAuthUser(req), input, getClientInfo(req)), 'Tushum qayd etildi');
  },

  async void(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = voidMoneySchema.parse(req.body);
    sendSuccess(res, await incomeService.void(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Tushum bekor qilindi',
    });
  },

  async categories(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await financeCategoryService.incomeCategories());
  },

  async createCategory(req: Request, res: Response): Promise<void> {
    const input = categorySchema.parse(req.body);
    sendCreated(
      res,
      await financeCategoryService.createCategory(requireAuthUser(req), 'income', input, getClientInfo(req)),
      'Kategoriya qo‘shildi',
    );
  },

  async updateCategory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateCategorySchema.parse(req.body);
    sendSuccess(
      res,
      await financeCategoryService.updateCategory(requireAuthUser(req), 'income', id, input, getClientInfo(req)),
      { message: 'Kategoriya saqlandi' },
    );
  },
};

export const expenseController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = moneyListQuerySchema.parse(req.query);
    const { items, total } = await expenseService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async stats(req: Request, res: Response): Promise<void> {
    const query = moneyListQuerySchema.parse(req.query);
    sendSuccess(res, await expenseService.stats(query));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createExpenseSchema.parse(req.body);
    sendCreated(res, await expenseService.create(requireAuthUser(req), input, getClientInfo(req)), 'Xarajat qayd etildi');
  },

  async void(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = voidMoneySchema.parse(req.body);
    sendSuccess(res, await expenseService.void(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Xarajat bekor qilindi',
    });
  },

  async categories(_req: Request, res: Response): Promise<void> {
    sendSuccess(res, await financeCategoryService.expenseCategories());
  },

  async createCategory(req: Request, res: Response): Promise<void> {
    const input = categorySchema.parse(req.body);
    sendCreated(
      res,
      await financeCategoryService.createCategory(requireAuthUser(req), 'expense', input, getClientInfo(req)),
      'Kategoriya qo‘shildi',
    );
  },

  async updateCategory(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateCategorySchema.parse(req.body);
    sendSuccess(
      res,
      await financeCategoryService.updateCategory(requireAuthUser(req), 'expense', id, input, getClientInfo(req)),
      { message: 'Kategoriya saqlandi' },
    );
  },
};

export const budgetController = {
  async get(req: Request, res: Response): Promise<void> {
    const query = budgetQuerySchema.parse(req.query);
    sendSuccess(res, await budgetService.get(query));
  },

  async save(req: Request, res: Response): Promise<void> {
    const input = saveBudgetSchema.parse(req.body);
    sendSuccess(res, await budgetService.save(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'Budjet saqlandi',
    });
  },

  async copy(req: Request, res: Response): Promise<void> {
    const input = budgetQuerySchema.parse(req.body);
    sendSuccess(res, await budgetService.copyFromPrevious(requireAuthUser(req), input, getClientInfo(req)), {
      message: 'O‘tgan oy budjetidan nusxa olindi',
    });
  },
};
