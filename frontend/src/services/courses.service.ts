import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { CourseItem, CourseListParams, CoursePayload } from '@/types/course';

export const coursesService = {
  async list(params: CourseListParams): Promise<Paginated<CourseItem>> {
    const response = await api.get<ApiSuccessResponse<CourseItem[]>>('/courses', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async create(payload: CoursePayload): Promise<MessageResult<CourseItem>> {
    const response = await api.post<ApiSuccessResponse<CourseItem>>('/courses', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: CoursePayload): Promise<MessageResult<CourseItem>> {
    const response = await api.put<ApiSuccessResponse<CourseItem>>(`/courses/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/courses/${id}`);
    return response.data.message;
  },
};
