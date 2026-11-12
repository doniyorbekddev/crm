import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { CancelChargesPayload, GenerateSchedulePayload, PaymentSchedule, ReplaceSchedulePayload } from '@/types/paymentSchedule';

export const paymentScheduleService = {
  async get(studentId: string): Promise<PaymentSchedule> {
    const response = await api.get<ApiSuccessResponse<PaymentSchedule>>(`/students/${studentId}/payment-schedule`);
    return response.data.data;
  },

  /** Har oyga to'liq oylik to'lov (`count` oy) — mavjud jadval almashtiriladi */
  async generate(studentId: string, payload: GenerateSchedulePayload): Promise<MessageResult<PaymentSchedule>> {
    const response = await api.post<ApiSuccessResponse<PaymentSchedule>>(`/students/${studentId}/payment-schedule/generate`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async replace(studentId: string, payload: ReplaceSchedulePayload): Promise<MessageResult<PaymentSchedule>> {
    const response = await api.put<ApiSuccessResponse<PaymentSchedule>>(`/students/${studentId}/payment-schedule`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** Oy majburiyatlarini bekor qilish (kelgusi, to'lanmagan oylar) — shartnoma kamayadi */
  async cancel(studentId: string, payload: CancelChargesPayload): Promise<MessageResult<PaymentSchedule>> {
    const response = await api.post<ApiSuccessResponse<PaymentSchedule>>(`/students/${studentId}/payment-schedule/cancel`, payload);
    return { data: response.data.data, message: response.data.message };
  },
};
