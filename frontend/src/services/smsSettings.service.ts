import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { SmsSettings, SmsSettingsPayload } from '@/types/settings';

export const smsSettingsService = {
  async get(): Promise<SmsSettings> {
    const response = await api.get<ApiSuccessResponse<SmsSettings>>('/settings/sms');
    return response.data.data;
  },

  async save(payload: SmsSettingsPayload): Promise<MessageResult<SmsSettings>> {
    const response = await api.put<ApiSuccessResponse<SmsSettings>>('/settings/sms', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async balance(): Promise<number | null> {
    const response = await api.get<ApiSuccessResponse<{ balance: number | null }>>('/settings/sms/balance');
    return response.data.data.balance;
  },

  async test(phone: string, message: string): Promise<MessageResult<{ providerMessageId: string }>> {
    const response = await api.post<ApiSuccessResponse<{ providerMessageId: string }>>('/settings/sms/test', { phone, message });
    return { data: response.data.data, message: response.data.message };
  },
};
