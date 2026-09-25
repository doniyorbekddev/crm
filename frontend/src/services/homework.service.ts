import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  BlueprintPreview,
  Exam,
  ExamBlueprint,
  ExamDetail,
  ExamListParams,
  ExamPayload,
  ExamResultRecord,
  GradeRecord,
  Homework,
  HomeworkDetail,
  HomeworkAttachment,
  HomeworkListParams,
  HomeworkPayload,
  Rubric,
  RubricPayload,
  SubmissionDetail,
  SubmissionFile,
} from '@/types/homework';
import { downloadFile } from '@/lib/download';

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

  /** Bitta o‘quvchi: ball yoki rubrika + izoh */
  async gradeOne(id: string, studentId: string, payload: Omit<GradeRecord, 'studentId'>): Promise<MessageResult<HomeworkDetail>> {
    const response = await api.patch<ApiSuccessResponse<HomeworkDetail>>(`/homework/${id}/submissions/${studentId}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** To‘liq javob: matn, havola, kod, fayllar, rubrika ballari */
  async submission(id: string, studentId: string): Promise<SubmissionDetail> {
    const response = await api.get<ApiSuccessResponse<SubmissionDetail>>(`/homework/${id}/submissions/${studentId}`);
    return response.data.data;
  },

  async returnSubmission(id: string, studentId: string, feedback: string): Promise<MessageResult<SubmissionDetail>> {
    const response = await api.post<ApiSuccessResponse<SubmissionDetail>>(`/homework/${id}/submissions/${studentId}/return`, { feedback });
    return { data: response.data.data, message: response.data.message };
  },

  downloadSubmissionFile(id: string, studentId: string, file: SubmissionFile): Promise<void> {
    return downloadFile(`/homework/${id}/submissions/${studentId}/files/${file.id}`, {}, file.originalName);
  },

  async addLink(id: string, payload: { title: string; url: string }): Promise<MessageResult<HomeworkAttachment>> {
    const response = await api.post<ApiSuccessResponse<HomeworkAttachment>>(`/homework/${id}/attachments`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async uploadAttachment(id: string, file: File): Promise<MessageResult<HomeworkAttachment>> {
    const response = await api.post<ApiSuccessResponse<HomeworkAttachment>>(`/homework/${id}/attachments/upload`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async removeAttachment(attachmentId: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/homework/attachments/${attachmentId}`);
    return response.data.message;
  },

  downloadAttachment(attachment: HomeworkAttachment): Promise<void> {
    return downloadFile(`/homework/attachments/${attachment.id}/download`, {}, attachment.originalName ?? attachment.title);
  },
};

/** Baholash mezonlari (TZ §20) */
export const rubricsService = {
  async list(includeInactive = false): Promise<Rubric[]> {
    const response = await api.get<ApiSuccessResponse<Rubric[]>>('/rubrics', { params: includeInactive ? { includeInactive: 'true' } : undefined });
    return response.data.data;
  },

  async create(payload: RubricPayload): Promise<MessageResult<Rubric>> {
    const response = await api.post<ApiSuccessResponse<Rubric>>('/rubrics', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: Partial<RubricPayload> & { isActive?: boolean }): Promise<MessageResult<Rubric>> {
    const response = await api.put<ApiSuccessResponse<Rubric>>(`/rubrics/${id}`, payload);
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

  /** Blueprint bo'yicha bankda savol yetarlimi — saqlashdan oldin */
  async previewBlueprint(groupId: string, blueprint: ExamBlueprint): Promise<BlueprintPreview> {
    const response = await api.post<ApiSuccessResponse<BlueprintPreview>>('/exams/blueprint/preview', { groupId, blueprint });
    return response.data.data;
  },

  async saveResults(id: string, records: ExamResultRecord[]): Promise<MessageResult<ExamDetail>> {
    const response = await api.put<ApiSuccessResponse<ExamDetail>>(`/exams/${id}/results`, { records });
    return { data: response.data.data, message: response.data.message };
  },
};
