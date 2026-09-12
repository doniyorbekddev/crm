import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { LeadFormLookups } from '@/types/lead';

export const lookupsService = {
  async leadForm(): Promise<LeadFormLookups> {
    const response = await api.get<ApiSuccessResponse<LeadFormLookups>>('/lookups/lead-form');
    return response.data.data;
  },
};
