import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { TaskAssignee, TaskComment, TaskCreatePayload, TaskDetail, TaskItem, TaskList, TaskListParams, TaskPriority, TaskStatus } from '@/types/task';

export const taskService = {
  async list(params: TaskListParams): Promise<TaskList> {
    const response = await api.get<ApiSuccessResponse<TaskList>>('/tasks', { params });
    return response.data.data;
  },

  async get(id: string): Promise<TaskDetail> {
    const response = await api.get<ApiSuccessResponse<TaskDetail>>(`/tasks/${id}`);
    return response.data.data;
  },

  async assignees(): Promise<TaskAssignee[]> {
    const response = await api.get<ApiSuccessResponse<TaskAssignee[]>>('/tasks/assignees');
    return response.data.data;
  },

  async create(payload: TaskCreatePayload): Promise<MessageResult<TaskItem>> {
    const response = await api.post<ApiSuccessResponse<TaskItem>>('/tasks', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: { title?: string; description?: string | null; dueAt?: string | null; priority?: TaskPriority; status?: TaskStatus }): Promise<MessageResult<TaskItem>> {
    const response = await api.patch<ApiSuccessResponse<TaskItem>>(`/tasks/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async setStatus(id: string, status: TaskStatus): Promise<MessageResult<TaskItem>> {
    const response = await api.patch<ApiSuccessResponse<TaskItem>>(`/tasks/${id}`, { status });
    return { data: response.data.data, message: response.data.message };
  },

  async assign(id: string, payload: { assigneeId: string; note?: string }): Promise<MessageResult<TaskItem>> {
    const response = await api.post<ApiSuccessResponse<TaskItem>>(`/tasks/${id}/assign`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async addComment(id: string, content: string): Promise<MessageResult<TaskComment>> {
    const response = await api.post<ApiSuccessResponse<TaskComment>>(`/tasks/${id}/comments`, { content });
    return { data: response.data.data, message: response.data.message };
  },
};
