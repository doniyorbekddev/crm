import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { DataQualityReport } from '@/types/dataQuality';

export const dataQualityService = {
  /** Ma'lumotlar sifati hisoboti (faqat o'qiydi) */
  async report(): Promise<DataQualityReport> {
    const response = await api.get<ApiSuccessResponse<DataQualityReport>>('/data-quality');
    return response.data.data;
  },
};
