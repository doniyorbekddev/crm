import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  Exam,
  ExamDetail,
  ExamListParams,
  ExamPayload,
  ExamResultRecord,
  GradeRecord,
  Homework,
  HomeworkDetail,
  HomeworkListParams,
  HomeworkPayload,
} from '@/types/homework';

export const homeworkService = {
  async list(params: HomeworkListParams): Promise<Paginated<Homework>> {
    const response = await api.get<ApiSuccessResponse<Homework[]>>('/homework', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async detail(id: string): Promise<HomeworkDetail> {
    const response = await api.get<ApiSuccessResponse<HomeworkDetail>>(`/homework/${id}`);
    return response.data.data;
  },

  async create(payload: HomeworkPayload): Promise<MessageResult<HomeworkDetail>> {
    const response = await api.post<ApiSuccessResponse<HomeworkDetail>>('/homework', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<Omit<HomeworkPayload, 'groupId'>>): Promise<MessageResult<HomeworkDetail>> {
    const response = await api.put<ApiSuccessResponse<HomeworkDetail>>(`/homework/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<MessageResult<{ id: string }>> {
    const response = await api.delete<ApiSuccessResponse<{ id: string }>>(`/homework/${id}`);
    return { data: response.data.data, message: response.data.message };
  },

  async grade(id: string, records: GradeRecord[]): Promise<MessageResult<HomeworkDetail>> {
    const response = await api.put<ApiSuccessResponse<HomeworkDetail>>(`/homework/${id}/submissions`, { records });
    return { data: response.data.data, message: response.data.message };
  },
};

export const examsService = {
  async list(params: ExamListParams): Promise<Paginated<Exam>> {
    const response = await api.get<ApiSuccessResponse<Exam[]>>('/exams', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async detail(id: string): Promise<ExamDetail> {
    const response = await api.get<ApiSuccessResponse<ExamDetail>>(`/exams/${id}`);
    return response.data.data;
  },

  async create(payload: ExamPayload): Promise<MessageResult<ExamDetail>> {
    const response = await api.post<ApiSuccessResponse<ExamDetail>>('/exams', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<Omit<ExamPayload, 'groupId'>>): Promise<MessageResult<ExamDetail>> {
    const response = await api.put<ApiSuccessResponse<ExamDetail>>(`/exams/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<MessageResult<{ id: string }>> {
    const response = await api.delete<ApiSuccessResponse<{ id: string }>>(`/exams/${id}`);
    return { data: response.data.data, message: response.data.message };
  },

  async saveResults(id: string, records: ExamResultRecord[]): Promise<MessageResult<ExamDetail>> {
    const response = await api.put<ApiSuccessResponse<ExamDetail>>(`/exams/${id}/results`, { records });
    return { data: response.data.data, message: response.data.message };
  },
};
