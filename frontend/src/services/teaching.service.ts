import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { TeachingGroup, TeachingOverview } from '@/types/teaching';

export const teachingService = {
  async overview(teacherId?: string): Promise<TeachingOverview> {
    const response = await api.get<ApiSuccessResponse<TeachingOverview>>('/teaching/overview', { params: { teacherId } });
    return response.data.data;
  },

  async group(groupId: string): Promise<TeachingGroup> {
    const response = await api.get<ApiSuccessResponse<TeachingGroup>>(`/teaching/groups/${groupId}`);
    return response.data.data;
  },
};
