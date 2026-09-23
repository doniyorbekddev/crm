import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  DiscountRule,
  DiscountRulePayload,
  DiscountSettings,
  DiscountSettingsDto,
  GrantDiscountPayload,
  PromoCode,
  PromoCodePayload,
  StudentDiscountSummary,
} from '@/types/discount';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const discountsService = {
  async settings(): Promise<DiscountSettingsDto> {
    const response = await api.get<ApiSuccessResponse<DiscountSettingsDto>>('/discounts/settings');
    return response.data.data;
  },

  async saveSettings(payload: DiscountSettings): Promise<MessageResult<DiscountSettingsDto>> {
    return withMessage(await api.put<ApiSuccessResponse<DiscountSettingsDto>>('/discounts/settings', payload));
  },

  async rules(includeInactive = false): Promise<DiscountRule[]> {
    const response = await api.get<ApiSuccessResponse<DiscountRule[]>>('/discounts/rules', {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
    return response.data.data;
  },

  async saveRule(payload: DiscountRulePayload): Promise<MessageResult<DiscountRule>> {
    return withMessage(await api.put<ApiSuccessResponse<DiscountRule>>('/discounts/rules', payload));
  },

  async promoCodes(includeInactive = false): Promise<PromoCode[]> {
    const response = await api.get<ApiSuccessResponse<PromoCode[]>>('/discounts/promo-codes', {
      params: includeInactive ? { includeInactive: 'true' } : {},
    });
    return response.data.data;
  },

  async createPromoCode(payload: PromoCodePayload): Promise<MessageResult<PromoCode>> {
    return withMessage(await api.post<ApiSuccessResponse<PromoCode>>('/discounts/promo-codes', payload));
  },

  async setPromoCodeActive(id: string, isActive: boolean): Promise<MessageResult<PromoCode>> {
    return withMessage(await api.patch<ApiSuccessResponse<PromoCode>>(`/discounts/promo-codes/${id}`, { isActive }));
  },

  async forStudent(studentId: string): Promise<StudentDiscountSummary> {
    const response = await api.get<ApiSuccessResponse<StudentDiscountSummary>>(`/discounts/students/${studentId}`);
    return response.data.data;
  },

  async grant(studentId: string, payload: GrantDiscountPayload): Promise<MessageResult<StudentDiscountSummary>> {
    return withMessage(await api.post<ApiSuccessResponse<StudentDiscountSummary>>(`/discounts/students/${studentId}`, payload));
  },

  async revoke(discountId: string, reason: string): Promise<MessageResult<StudentDiscountSummary>> {
    return withMessage(await api.post<ApiSuccessResponse<StudentDiscountSummary>>(`/discounts/${discountId}/revoke`, { reason }));
  },
};
