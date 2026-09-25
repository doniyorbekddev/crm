import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { Lesson, LessonMaterial, LessonPayload, LessonTree } from '@/types/lesson';

/** LMS darslari (xodim). Tahrirlash doirasi backendda: o‘qituvchi — faqat o‘z kurslari */
export const lessonsService = {
  async tree(courseId: string, includeArchived = false): Promise<LessonTree> {
    const response = await api.get<ApiSuccessResponse<LessonTree>>(`/courses/${courseId}/lessons`, {
      params: includeArchived ? { includeArchived: 'true' } : undefined,
    });
    return response.data.data;
  },

  async get(id: string): Promise<Lesson> {
    const response = await api.get<ApiSuccessResponse<Lesson>>(`/lessons/${id}`);
    return response.data.data;
  },

  async create(topicId: string, payload: LessonPayload): Promise<MessageResult<Lesson>> {
    const response = await api.post<ApiSuccessResponse<Lesson>>(`/curriculum/topics/${topicId}/lessons`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<LessonPayload>): Promise<MessageResult<Lesson>> {
    const response = await api.put<ApiSuccessResponse<Lesson>>(`/lessons/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/lessons/${id}`);
    return response.data.message;
  },

  async addLink(lessonId: string, payload: { kind: 'LINK' | 'VIDEO'; title: string; url: string }): Promise<MessageResult<LessonMaterial>> {
    const response = await api.post<ApiSuccessResponse<LessonMaterial>>(`/lessons/${lessonId}/materials`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async upload(lessonId: string, file: File, title?: string): Promise<MessageResult<LessonMaterial>> {
    const response = await api.post<ApiSuccessResponse<LessonMaterial>>(`/lessons/${lessonId}/materials/upload`, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        ...(title ? { 'X-Material-Title': encodeURIComponent(title) } : {}),
      },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async removeMaterial(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/lessons/materials/${id}`);
    return response.data.message;
  },

  download(material: LessonMaterial): Promise<void> {
    return downloadFile(`/lessons/materials/${material.id}/download`, {}, material.originalName ?? material.title);
  },
};
