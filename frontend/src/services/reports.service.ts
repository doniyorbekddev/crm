import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { Report, ReportParams, ReportType } from '@/types/report';

export const reportsService = {
  async build(type: ReportType, params: ReportParams): Promise<Report> {
    const response = await api.get<ApiSuccessResponse<Report>>(`/reports/${type}`, { params });
    return response.data.data;
  },
};
