import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { Curriculum, CurriculumModule, CurriculumTopic, StudentCurriculumProgress, TopicProgressStatus } from '@/types/curriculum';

export const curriculumService = {
  async forCourse(courseId: string): Promise<Curriculum> {
    const response = await api.get<ApiSuccessResponse<Curriculum>>(`/courses/${courseId}/curriculum`);
    return response.data.data;
  },

  async createModule(courseId: string, payload: { title: string; description?: string }): Promise<MessageResult<CurriculumModule>> {
    const response = await api.post<ApiSuccessResponse<CurriculumModule>>(`/courses/${courseId}/modules`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateModule(id: string, payload: { title?: string; isActive?: boolean }): Promise<MessageResult<CurriculumModule>> {
    const response = await api.put<ApiSuccessResponse<CurriculumModule>>(`/curriculum/modules/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async createTopic(moduleId: string, payload: { title: string; lessonCount?: number }): Promise<MessageResult<CurriculumTopic>> {
    const response = await api.post<ApiSuccessResponse<CurriculumTopic>>(`/curriculum/modules/${moduleId}/topics`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateTopic(id: string, payload: { title?: string; lessonCount?: number; isActive?: boolean }): Promise<MessageResult<CurriculumTopic>> {
    const response = await api.put<ApiSuccessResponse<CurriculumTopic>>(`/curriculum/topics/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** Mavzuni guruh bo‘yicha o‘tilgan deb belgilash */
  async markTopic(topicId: string, payload: { groupId: string; status?: TopicProgressStatus }): Promise<MessageResult<{ updated: number }>> {
    const response = await api.post<ApiSuccessResponse<{ updated: number }>>(`/curriculum/topics/${topicId}/mark`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async studentProgress(studentId: string): Promise<StudentCurriculumProgress | null> {
    const response = await api.get<ApiSuccessResponse<StudentCurriculumProgress | null>>(`/students/${studentId}/curriculum`);
    return response.data.data;
  },
};
