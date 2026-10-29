import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { LeadFormLookups } from '@/types/lead';

export interface MarketingSourceLookups {
  sources: Array<{ id: string; name: string }>;
}

/** Backend `CUSTOM_LABEL_FIELDS` bilan bir xil */
export type CustomLabelField = 'course-category' | 'parent-relation' | 'employee-position' | 'employee-department' | 'product-unit';

export const lookupsService = {
  /** Markaz avval yozgan nomlar — ko'p ishlatilgani birinchi */
  async customLabels(field: CustomLabelField): Promise<string[]> {
    const response = await api.get<ApiSuccessResponse<string[]>>(`/lookups/custom-labels/${field}`);
    return response.data.data;
  },

  /** Lead/reklama manbasini faqat nom bilan qo'shish (bir xil nom — 409, yashiringani qayta yoqiladi) */
  async createSource(name: string): Promise<{ id: string; name: string }> {
    const response = await api.post<ApiSuccessResponse<{ id: string; name: string }>>('/lookups/sources', { name });
    return response.data.data;
  },

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
