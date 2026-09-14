import { api } from '@/lib/api';
import type { ActivityFeed, ActivityParams } from '@/types/activity';
import type { ApiSuccessResponse } from '@/types/api';

export const activityService = {
  async feed(params: ActivityParams): Promise<ActivityFeed> {
    const response = await api.get<ApiSuccessResponse<ActivityFeed>>('/dashboard/activity', { params });
    return response.data.data;
  },
};
