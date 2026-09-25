import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { AcademicAnalytics, AcademicDimension } from '@/types/academicAnalytics';

export interface AcademicAnalyticsParams {
  dimension: AcademicDimension;
  from?: string;
  to?: string;
  courseId?: string;
}

export const academicAnalyticsService = {
  async build(params: AcademicAnalyticsParams): Promise<AcademicAnalytics> {
    const response = await api.get<ApiSuccessResponse<AcademicAnalytics>>('/analytics/academic', { params });
    return response.data.data;
  },
};
