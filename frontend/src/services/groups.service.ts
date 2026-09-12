import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { GroupFormLookups, GroupItem, GroupListParams, GroupPayload } from '@/types/group';

export const groupsService = {
  async list(params: GroupListParams): Promise<Paginated<GroupItem>> {
    const response = await api.get<ApiSuccessResponse<GroupItem[]>>('/groups', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async create(payload: GroupPayload): Promise<MessageResult<GroupItem>> {
    const response = await api.post<ApiSuccessResponse<GroupItem>>('/groups', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: GroupPayload): Promise<MessageResult<GroupItem>> {
    const response = await api.put<ApiSuccessResponse<GroupItem>>(`/groups/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/groups/${id}`);
    return response.data.message;
  },

  async formLookups(): Promise<GroupFormLookups> {
    const response = await api.get<ApiSuccessResponse<GroupFormLookups>>('/lookups/group-form');
    return response.data.data;
  },
};
