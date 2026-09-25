import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { TableName } from '@/utils/tableColumns';

export type PreferenceKey = 'dashboard.layout' | 'executive.layout' | 'portal.activeChild' | `table.${TableName}.columns`;

export const preferencesService = {
  async list(): Promise<Partial<Record<PreferenceKey, unknown>>> {
    const response = await api.get<ApiSuccessResponse<Partial<Record<PreferenceKey, unknown>>>>('/auth/me/preferences');
    return response.data.data;
  },

  async save<T>(key: PreferenceKey, value: T): Promise<T> {
    const response = await api.put<ApiSuccessResponse<T>>(`/auth/me/preferences/${key}`, value);
    return response.data.data;
  },
};
