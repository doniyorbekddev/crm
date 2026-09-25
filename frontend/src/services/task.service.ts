import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { TaskItem, TaskStatus } from '@/types/task';

export const taskService = {
  async list(params: { status?: TaskStatus; scope?: 'mine' | 'all' }): Promise<{ items: TaskItem[]; openCount: number }> {
    const response = await api.get<ApiSuccessResponse<{ items: TaskItem[]; openCount: number }>>('/tasks', { params });
    return response.data.data;
  },

  async setStatus(id: string, status: TaskStatus): Promise<MessageResult<TaskItem>> {
    const response = await api.patch<ApiSuccessResponse<TaskItem>>(`/tasks/${id}`, { status });
    return { data: response.data.data, message: response.data.message };
  },
};
