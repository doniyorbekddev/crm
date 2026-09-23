import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { Referral, ReferralListParams, ReferralLookup, ReferralStats } from '@/types/referral';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const referralsService = {
  async list(params: ReferralListParams): Promise<Paginated<Referral>> {
    const response = await api.get<ApiSuccessResponse<Referral[]>>('/referrals', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async stats(): Promise<ReferralStats> {
    const response = await api.get<ApiSuccessResponse<ReferralStats>>('/referrals/stats');
    return response.data.data;
  },

  /** Lead formasida kodni tekshirish: kim taklif qilgani ko‘rinadi */
  async lookup(code: string): Promise<ReferralLookup | null> {
    const response = await api.get<ApiSuccessResponse<ReferralLookup | null>>('/referrals/lookup', { params: { code } });
    return response.data.data;
  },

  async reward(id: string): Promise<MessageResult<Referral>> {
    return withMessage(await api.post<ApiSuccessResponse<Referral>>(`/referrals/${id}/reward`, {}));
  },

  async cancel(id: string, reason: string): Promise<MessageResult<Referral>> {
    return withMessage(await api.post<ApiSuccessResponse<Referral>>(`/referrals/${id}/cancel`, { reason }));
  },
};
