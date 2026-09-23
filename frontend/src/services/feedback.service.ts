import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { CreateFeedbackPayload, Feedback, FeedbackListParams, FeedbackPayload, FeedbackStats, FeedbackType } from '@/types/feedback';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const feedbackService = {
  async list(params: FeedbackListParams): Promise<Paginated<Feedback>> {
    const response = await api.get<ApiSuccessResponse<Feedback[]>>('/feedback', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async stats(params: { teacherId?: string; months?: number } = {}): Promise<FeedbackStats> {
    const response = await api.get<ApiSuccessResponse<FeedbackStats>>('/feedback/stats', { params });
    return response.data.data;
  },

  async create(payload: CreateFeedbackPayload): Promise<MessageResult<Feedback>> {
    return withMessage(await api.post<ApiSuccessResponse<Feedback>>('/feedback', payload));
  },

  async handle(id: string, note: string): Promise<MessageResult<Feedback>> {
    return withMessage(await api.post<ApiSuccessResponse<Feedback>>(`/feedback/${id}/handle`, { note }));
  },

  /** Kabinet: bugun qaysi turdagi fikrlar qoldirilgan */
  async portalState(studentId?: string): Promise<{ answeredToday: FeedbackType[] }> {
    const response = await api.get<ApiSuccessResponse<{ answeredToday: FeedbackType[] }>>('/portal/feedback', {
      params: studentId ? { studentId } : {},
    });
    return response.data.data;
  },

  /** Kabinet: o‘quvchi o‘zi fikr qoldiradi */
  async portalSubmit(payload: FeedbackPayload, studentId?: string): Promise<MessageResult<Feedback>> {
    return withMessage(
      await api.post<ApiSuccessResponse<Feedback>>('/portal/feedback', payload, { params: studentId ? { studentId } : {} }),
    );
  },
};
