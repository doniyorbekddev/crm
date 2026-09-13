import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  CreateParentPayload,
  ParentItem,
  ParentLinkPayload,
  ParentListParams,
  ParentPayload,
  ParentRelation,
  StudentParent,
} from '@/types/parent';

export const parentsService = {
  async list(params: ParentListParams): Promise<Paginated<ParentItem>> {
    const response = await api.get<ApiSuccessResponse<ParentItem[]>>('/parents', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async forStudent(studentId: string): Promise<StudentParent[]> {
    const response = await api.get<ApiSuccessResponse<StudentParent[]>>(`/students/${studentId}/parents`);
    return response.data.data;
  },

  async create(payload: CreateParentPayload): Promise<MessageResult<ParentItem>> {
    const response = await api.post<ApiSuccessResponse<ParentItem>>('/parents', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<ParentPayload>): Promise<MessageResult<ParentItem>> {
    const response = await api.put<ApiSuccessResponse<ParentItem>>(`/parents/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<MessageResult<{ id: string }>> {
    const response = await api.delete<ApiSuccessResponse<{ id: string }>>(`/parents/${id}`);
    return { data: response.data.data, message: response.data.message };
  },

  async linkStudent(parentId: string, payload: ParentLinkPayload): Promise<MessageResult<ParentItem>> {
    const response = await api.post<ApiSuccessResponse<ParentItem>>(`/parents/${parentId}/students`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateLink(linkId: string, payload: { relation?: ParentRelation; isPrimary?: boolean }): Promise<MessageResult<StudentParent[]>> {
    const response = await api.patch<ApiSuccessResponse<StudentParent[]>>(`/parents/links/${linkId}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async unlink(linkId: string): Promise<MessageResult<StudentParent[]>> {
    const response = await api.delete<ApiSuccessResponse<StudentParent[]>>(`/parents/links/${linkId}`);
    return { data: response.data.data, message: response.data.message };
  },
};
