import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { GroupMastery, MasterySettings, ProgressHistoryPoint, StudentMastery } from '@/types/mastery';

export const masteryService = {
  async student(studentId: string): Promise<StudentMastery> {
    const response = await api.get<ApiSuccessResponse<StudentMastery>>(`/students/${studentId}/mastery`);
    return response.data.data;
  },

  async history(studentId: string): Promise<ProgressHistoryPoint[]> {
    const response = await api.get<ApiSuccessResponse<ProgressHistoryPoint[]>>(`/students/${studentId}/progress-history`);
    return response.data.data;
  },

  async group(groupId: string): Promise<GroupMastery> {
    const response = await api.get<ApiSuccessResponse<GroupMastery>>(`/groups/${groupId}/mastery`);
    return response.data.data;
  },

  async settings(): Promise<MasterySettings> {
    const response = await api.get<ApiSuccessResponse<MasterySettings>>('/mastery/settings');
    return response.data.data;
  },

  async updateSettings(payload: MasterySettings): Promise<MessageResult<MasterySettings>> {
    const response = await api.put<ApiSuccessResponse<MasterySettings>>('/mastery/settings', payload);
    return { data: response.data.data, message: response.data.message };
  },
};
