import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { ExamAttempt, Question, QuestionDifficulty, QuestionPayload } from '@/types/question';

export interface QuestionListParams {
  page: number;
  limit: number;
  courseId?: string;
  topicId?: string;
  difficulty?: QuestionDifficulty;
  search?: string;
}

export const questionsService = {
  async list(params: QuestionListParams): Promise<Paginated<Question>> {
    const response = await api.get<ApiSuccessResponse<Question[]>>('/questions', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async create(payload: QuestionPayload): Promise<MessageResult<Question>> {
    const response = await api.post<ApiSuccessResponse<Question>>('/questions', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: QuestionPayload): Promise<MessageResult<Question>> {
    const response = await api.put<ApiSuccessResponse<Question>>(`/questions/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** Imtihonga savollarni biriktirish: qo‘lda yoki tasodifiy */
  async attachToExam(
    examId: string,
    payload: { questionIds?: string[]; random?: { count: number; topicId?: string; difficulty?: QuestionDifficulty } },
  ): Promise<MessageResult<{ attached: number }>> {
    const response = await api.post<ApiSuccessResponse<{ attached: number }>>(`/exams/${examId}/questions`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async attempts(examId: string): Promise<ExamAttempt[]> {
    const response = await api.get<ApiSuccessResponse<ExamAttempt[]>>(`/exams/${examId}/attempts`);
    return response.data.data;
  },
};
