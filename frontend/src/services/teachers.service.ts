import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  CreateTeacherPayload,
  MyTeaching,
  SalaryPeriod,
  SalaryRule,
  SalaryRulePayload,
  TeacherCandidate,
  TeacherDetail,
  TeacherItem,
  TeacherListParams,
  TeacherProfilePayload,
} from '@/types/teacher';

export const teachersService = {
  async list(params: TeacherListParams): Promise<Paginated<TeacherItem>> {
    const response = await api.get<ApiSuccessResponse<TeacherItem[]>>('/teachers', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async detail(id: string): Promise<TeacherDetail> {
    const response = await api.get<ApiSuccessResponse<TeacherDetail>>(`/teachers/${id}`);
    return response.data.data;
  },

  async candidates(): Promise<TeacherCandidate[]> {
    const response = await api.get<ApiSuccessResponse<TeacherCandidate[]>>('/teachers/candidates');
    return response.data.data;
  },

  async myTeaching(): Promise<MyTeaching> {
    const response = await api.get<ApiSuccessResponse<MyTeaching>>('/teachers/me');
    return response.data.data;
  },

  async create(payload: CreateTeacherPayload): Promise<MessageResult<TeacherDetail>> {
    const response = await api.post<ApiSuccessResponse<TeacherDetail>>('/teachers', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async update(id: string, payload: TeacherProfilePayload): Promise<MessageResult<TeacherDetail>> {
    const response = await api.put<ApiSuccessResponse<TeacherDetail>>(`/teachers/${id}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async salaryRules(id: string): Promise<SalaryRule[]> {
    const response = await api.get<ApiSuccessResponse<SalaryRule[]>>(`/teachers/${id}/salary-rules`);
    return response.data.data;
  },

  async createSalaryRule(id: string, payload: SalaryRulePayload): Promise<MessageResult<SalaryRule>> {
    const response = await api.post<ApiSuccessResponse<SalaryRule>>(`/teachers/${id}/salary-rules`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async salaryHistory(id: string, params: { year?: number; limit?: number } = {}): Promise<SalaryPeriod[]> {
    const response = await api.get<ApiSuccessResponse<SalaryPeriod[]>>(`/teachers/${id}/salary-periods`, { params });
    return response.data.data;
  },
};
