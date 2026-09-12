import { api } from '@/lib/api';
import type { StudentExamRow, StudentHomeworkRow, StudentProfile } from '@/types/studentProfile';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { StudentAttendanceHistory } from '@/types/attendance';
import type {
  ConvertLeadPayload,
  StudentFormLookups,
  StudentItem,
  StudentListParams,
  StudentPayload,
  StudentStatus,
  StudentStatusSummary,
  StudentSummaryParams,
} from '@/types/student';

export const studentsService = {
  async list(params: StudentListParams): Promise<Paginated<StudentItem>> {
    const response = await api.get<ApiSuccessResponse<StudentItem[]>>('/students', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(params: StudentSummaryParams): Promise<StudentStatusSummary> {
    const response = await api.get<ApiSuccessResponse<StudentStatusSummary>>('/students/summary', { params });
    return response.data.data;
  },

  async getById(id: string): Promise<StudentItem> {
    const response = await api.get<ApiSuccessResponse<StudentItem>>(`/students/${id}`);
    return response.data.data;
  },

  async create(payload: StudentPayload): Promise<MessageResult<StudentItem>> {
    const response = await api.post<ApiSuccessResponse<StudentItem>>('/students', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: StudentPayload): Promise<MessageResult<StudentItem>> {
    const response = await api.put<ApiSuccessResponse<StudentItem>>(`/students/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async setStatus(id: string, status: StudentStatus): Promise<MessageResult<StudentItem>> {
    const response = await api.patch<ApiSuccessResponse<StudentItem>>(`/students/${id}/status`, { status });
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/students/${id}`);
    return response.data.message;
  },

  async convertLead(leadId: string, payload: ConvertLeadPayload): Promise<MessageResult<StudentItem>> {
    const response = await api.post<ApiSuccessResponse<StudentItem>>(`/leads/${leadId}/convert`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async attendanceHistory(id: string): Promise<StudentAttendanceHistory> {
    const response = await api.get<ApiSuccessResponse<StudentAttendanceHistory>>(`/students/${id}/attendance`);
    return response.data.data;
  },

  async profile(id: string): Promise<StudentProfile> {
    const response = await api.get<ApiSuccessResponse<StudentProfile>>(`/students/${id}/profile`);
    return response.data.data;
  },

  async homework(id: string): Promise<StudentHomeworkRow[]> {
    const response = await api.get<ApiSuccessResponse<StudentHomeworkRow[]>>(`/students/${id}/homework`);
    return response.data.data;
  },

  async exams(id: string): Promise<StudentExamRow[]> {
    const response = await api.get<ApiSuccessResponse<StudentExamRow[]>>(`/students/${id}/exams`);
    return response.data.data;
  },

  async formLookups(): Promise<StudentFormLookups> {
    const response = await api.get<ApiSuccessResponse<StudentFormLookups>>('/lookups/student-form');
    return response.data.data;
  },
};
