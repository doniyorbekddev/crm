import { api } from '@/lib/api';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { AuditFilters, AuditListParams, AuditLogItem } from '@/types/audit';

export const auditService = {
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
