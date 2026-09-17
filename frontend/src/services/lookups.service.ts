import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { LeadFormLookups } from '@/types/lead';

export interface MarketingSourceLookups {
  sources: Array<{ id: string; name: string }>;
}

export const lookupsService = {
  /** Reklama xarajatini kanalga bog‘lash uchun manbalar (xarajat yoki analitika ruxsati bilan) */
  async marketingSources(): Promise<MarketingSourceLookups> {
    const response = await api.get<ApiSuccessResponse<MarketingSourceLookups>>('/lookups/marketing-sources');
    return response.data.data;
  },

  async leadForm(): Promise<LeadFormLookups> {
    const response = await api.get<ApiSuccessResponse<LeadFormLookups>>('/lookups/lead-form');
    return response.data.data;
  },
};
