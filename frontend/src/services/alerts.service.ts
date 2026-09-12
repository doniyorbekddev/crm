import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  Alert,
  AlertListParams,
  AlertSummary,
  EvaluateResult,
  SaveTargetPayload,
  TargetOverview,
} from '@/types/alert';

export const alertsService = {
  async list(params: AlertListParams): Promise<Paginated<Alert>> {
    const response = await api.get<ApiSuccessResponse<Alert[]>>('/alerts', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(): Promise<AlertSummary> {
    const response = await api.get<ApiSuccessResponse<AlertSummary>>('/alerts/summary');
    return response.data.data;
  },

  async evaluate(): Promise<MessageResult<EvaluateResult>> {
    const response = await api.post<ApiSuccessResponse<EvaluateResult>>('/alerts/evaluate');
    return { data: response.data.data, message: response.data.message };
  },

  async resolve(id: string, note?: string): Promise<MessageResult<Alert>> {
    const response = await api.patch<ApiSuccessResponse<Alert>>(`/alerts/${id}/resolve`, note ? { note } : {});
    return { data: response.data.data, message: response.data.message };
  },
};

export const targetsService = {
  async overview(params: { year?: number; month?: number }): Promise<TargetOverview> {
    const response = await api.get<ApiSuccessResponse<TargetOverview>>('/targets', { params });
    return response.data.data;
  },

  async save(payload: SaveTargetPayload): Promise<MessageResult<TargetOverview>> {
    const response = await api.put<ApiSuccessResponse<TargetOverview>>('/targets', payload);
    return { data: response.data.data, message: response.data.message };
  },
};
