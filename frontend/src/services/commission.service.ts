import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { CommissionParams, TeacherCommissionDetail, TeacherCommissionSummary } from '@/types/commission';

export const commissionService = {
  async list(params: CommissionParams): Promise<TeacherCommissionSummary[]> {
    const response = await api.get<ApiSuccessResponse<TeacherCommissionSummary[]>>('/teacher-commissions', { params });
    return response.data.data;
  },

  async detail(teacherProfileId: string, params: CommissionParams): Promise<TeacherCommissionDetail> {
    const response = await api.get<ApiSuccessResponse<TeacherCommissionDetail>>(`/teacher-commissions/${teacherProfileId}`, { params });
    return response.data.data;
  },

  async mine(params: CommissionParams): Promise<TeacherCommissionDetail> {
    const response = await api.get<ApiSuccessResponse<TeacherCommissionDetail>>('/teacher-commissions/me', { params });
    return response.data.data;
  },
};
