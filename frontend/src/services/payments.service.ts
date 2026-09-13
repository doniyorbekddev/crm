import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  DebtItem,
  DebtListParams,
  DebtSummary,
  DebtSummaryParams,
  PaymentFormLookups,
  PaymentItem,
  PaymentListParams,
  PaymentPayload,
  PaymentStats,
  PaymentStatsParams, RefundPayload } from '@/types/payment';

export const paymentsService = {
  async list(params: PaymentListParams): Promise<Paginated<PaymentItem>> {
    const response = await api.get<ApiSuccessResponse<PaymentItem[]>>('/payments', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async stats(params: PaymentStatsParams): Promise<PaymentStats> {
    const response = await api.get<ApiSuccessResponse<PaymentStats>>('/payments/stats', { params });
    return response.data.data;
  },

  async create(payload: PaymentPayload): Promise<MessageResult<PaymentItem>> {
    const response = await api.post<ApiSuccessResponse<PaymentItem>>('/payments', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async refund(id: string, payload: RefundPayload): Promise<MessageResult<PaymentItem>> {
    const response = await api.post<ApiSuccessResponse<PaymentItem>>(`/payments/${id}/refunds`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string, reason: string): Promise<MessageResult<PaymentItem>> {
    const response = await api.delete<ApiSuccessResponse<PaymentItem>>(`/payments/${id}`, { data: { reason } });
    return { data: response.data.data, message: response.data.message };
  },

  async formLookups(): Promise<PaymentFormLookups> {
    const response = await api.get<ApiSuccessResponse<PaymentFormLookups>>('/lookups/payment-form');
    return response.data.data;
  },
};

export const debtsService = {
  async list(params: DebtListParams): Promise<Paginated<DebtItem>> {
    const response = await api.get<ApiSuccessResponse<DebtItem[]>>('/debts', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(params: DebtSummaryParams): Promise<DebtSummary> {
    const response = await api.get<ApiSuccessResponse<DebtSummary>>('/debts/summary', { params });
    return response.data.data;
  },
};
