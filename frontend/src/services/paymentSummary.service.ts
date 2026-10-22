import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { PaymentSummary, PaymentSummaryScope } from '@/types/paymentSummary';

export const paymentSummaryService = {
  async get(scope: PaymentSummaryScope): Promise<PaymentSummary> {
    const response = await api.get<ApiSuccessResponse<PaymentSummary>>('/payment-summary', { params: { scope } });
    return response.data.data;
  },
};
