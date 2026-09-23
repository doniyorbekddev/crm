import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { TelegramLink } from '@/types/telegram';

export const telegramService = {
  async myLink(): Promise<TelegramLink> {
    const response = await api.get<ApiSuccessResponse<TelegramLink>>('/telegram/me');
    return response.data.data;
  },

  async unlink(): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>('/telegram/me');
    return response.data.message;
  },
};
