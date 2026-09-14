import { api } from '@/lib/api';
import type { AnalyticsRangeParams, Cohorts, Profitability, ProfitabilityDimension, SourceAnalytics, UnitEconomics } from '@/types/analytics';
import type { ApiSuccessResponse } from '@/types/api';

export const analyticsService = {
  async unitEconomics(params: AnalyticsRangeParams): Promise<UnitEconomics> {
    const response = await api.get<ApiSuccessResponse<UnitEconomics>>('/analytics/unit-economics', { params });
    return response.data.data;
  },

  async profitability(params: AnalyticsRangeParams & { dimension: ProfitabilityDimension }): Promise<Profitability> {
    const response = await api.get<ApiSuccessResponse<Profitability>>('/analytics/profitability', { params });
    return response.data.data;
  },

  async cohorts(months: number): Promise<Cohorts> {
    const response = await api.get<ApiSuccessResponse<Cohorts>>('/analytics/cohorts', { params: { months } });
    return response.data.data;
  },

  async sources(params: AnalyticsRangeParams): Promise<SourceAnalytics> {
    const response = await api.get<ApiSuccessResponse<SourceAnalytics>>('/analytics/sources', { params });
    return response.data.data;
  },
};
