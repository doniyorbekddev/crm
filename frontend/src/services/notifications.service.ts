import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { NotificationItem, NotificationListParams, NotificationSetting, NotificationSummary } from '@/types/notification';

export const notificationsService = {
  async list(params: NotificationListParams): Promise<Paginated<NotificationItem>> {
    const response = await api.get<ApiSuccessResponse<NotificationItem[]>>('/notifications', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(): Promise<NotificationSummary> {
    const response = await api.get<ApiSuccessResponse<NotificationSummary>>('/notifications/summary');
    return response.data.data;
  },

  /** Xodimning shaxsiy sozlamalari — barcha turlar ro‘yxati bilan qaytadi */
  async settings(): Promise<NotificationSetting[]> {
    const response = await api.get<ApiSuccessResponse<NotificationSetting[]>>('/notifications/settings');
    return response.data.data;
  },

  async saveSettings(items: Array<{ type: string; inApp: boolean; telegram: boolean }>): Promise<MessageResult<NotificationSetting[]>> {
    const response = await api.put<ApiSuccessResponse<NotificationSetting[]>>('/notifications/settings', { items });
    return { data: response.data.data, message: response.data.message };
  },

  async markRead(id: string): Promise<NotificationItem> {
    const response = await api.patch<ApiSuccessResponse<NotificationItem>>(`/notifications/${id}/read`);
    return response.data.data;
  },

  async markAllRead(): Promise<MessageResult<{ count: number }>> {
    const response = await api.patch<ApiSuccessResponse<{ count: number }>>('/notifications/read-all');
    return { data: response.data.data, message: response.data.message };
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/notifications/${id}`);
    return response.data.message;
  },

  async clearRead(): Promise<MessageResult<{ count: number }>> {
    const response = await api.delete<ApiSuccessResponse<{ count: number }>>('/notifications/read');
    return { data: response.data.data, message: response.data.message };
  },
};
