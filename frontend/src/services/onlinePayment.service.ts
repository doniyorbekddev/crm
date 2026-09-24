import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { CreateIntentPayload, IntentListParams, PaymentIntent, PaymentProviderInfo } from '@/types/onlinePayment';

export const onlinePaymentService = {
  async providers(): Promise<PaymentProviderInfo[]> {
    const response = await api.get<ApiSuccessResponse<PaymentProviderInfo[]>>('/payments/online/providers');
    return response.data.data;
  },

  async list(params: IntentListParams): Promise<Paginated<PaymentIntent>> {
    const response = await api.get<ApiSuccessResponse<PaymentIntent[]>>('/payments/online/intents', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async createIntent(payload: CreateIntentPayload): Promise<MessageResult<PaymentIntent>> {
    const response = await api.post<ApiSuccessResponse<PaymentIntent>>('/payments/online/intents', payload);
    return { data: response.data.data, message: response.data.message };
  },
};
