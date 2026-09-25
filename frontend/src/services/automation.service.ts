import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { AutomationRule, AutomationRun, AutomationRunParams, AutomationUpdatePayload, AutomationDryRun, BuilderRulePayload } from '@/types/automation';

export const automationService = {
  async list(): Promise<AutomationRule[]> {
    const response = await api.get<ApiSuccessResponse<AutomationRule[]>>('/automation');
    return response.data.data;
  },

  async runs(params: AutomationRunParams): Promise<Paginated<AutomationRun>> {
    const response = await api.get<ApiSuccessResponse<AutomationRun[]>>('/automation/runs', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async update(key: string, payload: AutomationUpdatePayload): Promise<MessageResult<AutomationRule>> {
    const response = await api.put<ApiSuccessResponse<AutomationRule>>(`/automation/${key}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** TZ §51: yangi maxsus qoida */
  async create(payload: BuilderRulePayload): Promise<MessageResult<AutomationRule>> {
    const response = await api.post<ApiSuccessResponse<AutomationRule>>('/automation', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async updateCustom(key: string, payload: BuilderRulePayload): Promise<MessageResult<AutomationRule>> {
    const response = await api.put<ApiSuccessResponse<AutomationRule>>(`/automation/custom/${key}`, payload);
    return { data: response.data.data, message: response.data.message };
  },

  async remove(key: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/automation/${key}`);
    return response.data.message;
  },

  /** Sinov: nechta holat mos keladi (hech narsa yuborilmaydi) */
  async test(payload: Pick<BuilderRulePayload, 'trigger' | 'conditions'>): Promise<AutomationDryRun> {
    const response = await api.post<ApiSuccessResponse<AutomationDryRun>>('/automation/test', payload);
    return response.data.data;
  },

  /** Qo‘lda ishga tushirish — sozlamani o‘zgartirgandan keyin darhol tekshirish uchun */
  async run(): Promise<MessageResult<{ rules: number; notified: number }>> {
    const response = await api.post<ApiSuccessResponse<{ rules: number; notified: number }>>('/automation/run', {});
    return { data: response.data.data, message: response.data.message };
  },
};
