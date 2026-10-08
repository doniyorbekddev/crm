import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { MyWork } from '@/types/myWork';

export const myWorkService = {
  async get(): Promise<MyWork> {
    const response = await api.get<ApiSuccessResponse<MyWork>>('/my-work');
    return response.data.data;
  },
};
