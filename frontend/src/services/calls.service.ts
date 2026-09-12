import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { CallItem, CallListParams, CallPayload, CreateCallPayload } from '@/types/call';

export const callsService = {
  async list(params: CallListParams): Promise<Paginated<CallItem>> {
    const response = await api.get<ApiSuccessResponse<CallItem[]>>('/calls', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async create(payload: CreateCallPayload): Promise<MessageResult<CallItem>> {
    const response = await api.post<ApiSuccessResponse<CallItem>>('/calls', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: CallPayload): Promise<MessageResult<CallItem>> {
    const response = await api.put<ApiSuccessResponse<CallItem>>(`/calls/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/calls/${id}`);
    return response.data.message;
  },
};
