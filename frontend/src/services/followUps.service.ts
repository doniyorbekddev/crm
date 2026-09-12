import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  CompleteFollowUpPayload,
  CreateFollowUpPayload,
  FollowUpItem,
  FollowUpListParams,
  FollowUpPayload,
  FollowUpSummary,
} from '@/types/followUp';

export const followUpsService = {
  async list(params: FollowUpListParams): Promise<Paginated<FollowUpItem>> {
    const response = await api.get<ApiSuccessResponse<FollowUpItem[]>>('/follow-ups', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(params: { assignedTo?: string; leadId?: string }): Promise<FollowUpSummary> {
    const response = await api.get<ApiSuccessResponse<FollowUpSummary>>('/follow-ups/summary', { params });
    return response.data.data;
  },

  async create(payload: CreateFollowUpPayload): Promise<MessageResult<FollowUpItem>> {
    const response = await api.post<ApiSuccessResponse<FollowUpItem>>('/follow-ups', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: FollowUpPayload): Promise<MessageResult<FollowUpItem>> {
    const response = await api.put<ApiSuccessResponse<FollowUpItem>>(`/follow-ups/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async complete(id: string, payload: CompleteFollowUpPayload): Promise<MessageResult<FollowUpItem>> {
    const response = await api.patch<ApiSuccessResponse<FollowUpItem>>(`/follow-ups/${id}/complete`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/follow-ups/${id}`);
    return response.data.message;
  },
};
