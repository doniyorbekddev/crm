import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  ChartPeriod,
  ChartPoint,
  DashboardFollowUp,
  DashboardSummary,
  ExecutiveParams,
  ExecutiveSummary,
  FunnelStage,
  ManagerPeriod,
  ManagerStats,
} from '@/types/dashboard';

export const dashboardService = {
  async executive(params: ExecutiveParams = {}): Promise<ExecutiveSummary> {
    const response = await api.get<ApiSuccessResponse<ExecutiveSummary>>('/dashboard/executive', { params });
    return response.data.data;
  },

  async summary(): Promise<DashboardSummary> {
    const response = await api.get<ApiSuccessResponse<DashboardSummary>>('/dashboard/summary');
    return response.data.data;
  },

  async charts(period: ChartPeriod): Promise<ChartPoint[]> {
    const response = await api.get<ApiSuccessResponse<ChartPoint[]>>('/dashboard/charts', { params: { period } });
    return response.data.data;
  },

  async funnel(): Promise<FunnelStage[]> {
    const response = await api.get<ApiSuccessResponse<FunnelStage[]>>('/dashboard/funnel');
    return response.data.data;
  },

  async managers(period: ManagerPeriod): Promise<ManagerStats[]> {
    const response = await api.get<ApiSuccessResponse<ManagerStats[]>>('/dashboard/managers', { params: { period } });
    return response.data.data;
  },

  async followUps(): Promise<DashboardFollowUp[]> {
    const response = await api.get<ApiSuccessResponse<DashboardFollowUp[]>>('/dashboard/follow-ups');
    return response.data.data;
  },
};
