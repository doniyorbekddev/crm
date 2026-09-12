import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  CreateUserPayload,
  UpdateUserStatusPayload,
  UserFormPayload,
  UserListItem,
  UserListParams,
  UserStatusSummary,
  UserSummaryParams,
} from '@/types/user';

export const usersService = {
  async list(params: UserListParams): Promise<Paginated<UserListItem>> {
    const response = await api.get<ApiSuccessResponse<UserListItem[]>>('/users', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(params: UserSummaryParams): Promise<UserStatusSummary> {
    const response = await api.get<ApiSuccessResponse<UserStatusSummary>>('/users/summary', { params });
    return response.data.data;
  },

  async create(payload: CreateUserPayload): Promise<MessageResult<UserListItem>> {
    const response = await api.post<ApiSuccessResponse<UserListItem>>('/users', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: UserFormPayload): Promise<MessageResult<UserListItem>> {
    const response = await api.put<ApiSuccessResponse<UserListItem>>(`/users/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async setStatus(id: string, payload: UpdateUserStatusPayload): Promise<MessageResult<UserListItem>> {
    const response = await api.patch<ApiSuccessResponse<UserListItem>>(`/users/${id}/status`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async resetPassword(id: string, password: string): Promise<string> {
    const response = await api.patch<ApiSuccessResponse<null>>(`/users/${id}/password`, { password });
    return response.data.message;
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/users/${id}`);
    return response.data.message;
  },
};
