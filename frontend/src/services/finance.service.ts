import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  Budget,
  BudgetPayload,
  CashFlowParams,
  CashFlowPoint,
  FinanceAccount,
  FinanceCategory,
  FinanceRangeParams,
  FinanceSummary,
  MoneyEntry,
  MoneyListParams,
  MoneyPayload,
  MoneyStats,
  Transaction,
  TransactionListParams,
  TransferPayload,
} from '@/types/finance';

/** Tushum va xarajat API'lari bir xil — bitta fabrikadan ikkita servis */
function moneyService(resource: 'incomes' | 'expenses') {
  return {
    async list(params: MoneyListParams): Promise<Paginated<MoneyEntry>> {
      const response = await api.get<ApiSuccessResponse<MoneyEntry[]>>(`/${resource}`, { params });
      const items = response.data.data;
      return {
        items,
        meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
      };
    },

    async stats(params: Omit<MoneyListParams, 'page' | 'limit'>): Promise<MoneyStats> {
      const response = await api.get<ApiSuccessResponse<MoneyStats>>(`/${resource}/stats`, { params });
      return response.data.data;
    },

    async create(payload: MoneyPayload): Promise<MessageResult<MoneyEntry>> {
      const response = await api.post<ApiSuccessResponse<MoneyEntry>>(`/${resource}`, payload);
      return { data: response.data.data, message: response.data.message };
    },

    async void(id: string, reason: string): Promise<MessageResult<MoneyEntry>> {
      const response = await api.post<ApiSuccessResponse<MoneyEntry>>(`/${resource}/${id}/void`, { reason });
      return { data: response.data.data, message: response.data.message };
    },

    async categories(): Promise<FinanceCategory[]> {
      const response = await api.get<ApiSuccessResponse<FinanceCategory[]>>(`/${resource}/categories`);
      return response.data.data;
    },

    async createCategory(payload: { key: string; name: string; sortOrder?: number }): Promise<MessageResult<FinanceCategory[]>> {
      const response = await api.post<ApiSuccessResponse<FinanceCategory[]>>(`/${resource}/categories`, payload);
      return { data: response.data.data, message: response.data.message };
    },

    async updateCategory(
      id: string,
      payload: { name?: string; sortOrder?: number; isActive?: boolean },
    ): Promise<MessageResult<FinanceCategory[]>> {
      const response = await api.put<ApiSuccessResponse<FinanceCategory[]>>(`/${resource}/categories/${id}`, payload);
      return { data: response.data.data, message: response.data.message };
    },
  };
}

export const incomesService = moneyService('incomes');
export const expensesService = moneyService('expenses');

export const financeService = {
  async summary(params: FinanceRangeParams): Promise<FinanceSummary> {
    const response = await api.get<ApiSuccessResponse<FinanceSummary>>('/finance/summary', { params });
    return response.data.data;
  },

  async cashFlow(params: CashFlowParams): Promise<CashFlowPoint[]> {
    const response = await api.get<ApiSuccessResponse<CashFlowPoint[]>>('/finance/cash-flow', { params });
    return response.data.data;
  },

  async accounts(params: FinanceRangeParams = {}): Promise<{ items: FinanceAccount[]; totalBalance: number }> {
    const response = await api.get<ApiSuccessResponse<{ items: FinanceAccount[]; totalBalance: number }>>(
      '/finance/accounts',
      { params },
    );
    return response.data.data;
  },

  async transactions(params: TransactionListParams): Promise<Paginated<Transaction>> {
    const response = await api.get<ApiSuccessResponse<Transaction[]>>('/finance/transactions', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async transfer(payload: TransferPayload): Promise<MessageResult<Transaction[]>> {
    const response = await api.post<ApiSuccessResponse<Transaction[]>>('/finance/transfers', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async voidTransaction(id: string, reason: string): Promise<MessageResult<Transaction>> {
    const response = await api.post<ApiSuccessResponse<Transaction>>(`/finance/transactions/${id}/void`, { reason });
    return { data: response.data.data, message: response.data.message };
  },

  async budget(params: { year: number; month: number }): Promise<Budget> {
    const response = await api.get<ApiSuccessResponse<Budget>>('/finance/budget', { params });
    return response.data.data;
  },

  async saveBudget(payload: BudgetPayload): Promise<MessageResult<Budget>> {
    const response = await api.put<ApiSuccessResponse<Budget>>('/finance/budget', payload);
    return { data: response.data.data, message: response.data.message };
  },
};
