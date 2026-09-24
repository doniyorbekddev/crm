import { api } from '@/lib/api';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { AuditFilters, AuditListParams, AuditLogItem } from '@/types/audit';

export interface AuditSettings {
  /** Oddiy yozuvlar shuncha kundan keyin o‘chiriladi (0 — hech qachon) */
  retentionDays: number;
  /** Muhim amallar shuncha kun saqlanadi */
  criticalRetentionDays: number;
  updatedAt?: string | null;
}

export const auditService = {
  async settings(): Promise<AuditSettings> {
    const response = await api.get<ApiSuccessResponse<AuditSettings>>('/audit-logs/settings');
    return response.data.data;
  },

  async saveSettings(payload: { retentionDays: number; criticalRetentionDays: number }): Promise<{ data: AuditSettings; message: string }> {
    const response = await api.put<ApiSuccessResponse<AuditSettings>>('/audit-logs/settings', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async list(params: AuditListParams): Promise<Paginated<AuditLogItem>> {
    const response = await api.get<ApiSuccessResponse<AuditLogItem[]>>('/audit-logs', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async filters(): Promise<AuditFilters> {
    const response = await api.get<ApiSuccessResponse<AuditFilters>>('/audit-logs/filters');
    return response.data.data;
  },
};
