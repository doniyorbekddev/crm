import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type {
  AssignmentRule,
  AssignmentRulePayload,
  CreateLeadPayload,
  LeadActivity,
  LeadDetail,
  LeadFilters,
  LeadKanbanColumn,
  LeadListItem,
  LeadListParams,
  LeadNote,
  LeadPayload,
  LeadScoreResult,
  LeadStatusSummary,
  UpdateLeadStatusPayload,
} from '@/types/lead';

const KANBAN_PER_COLUMN = 50;

function listQuery(params: LeadListParams) {
  const { status, ...rest } = params;
  return { ...rest, ...(status && status.length > 0 ? { status: status.join(',') } : {}) };
}

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const leadsService = {
  async list(params: LeadListParams): Promise<Paginated<LeadListItem>> {
    const response = await api.get<ApiSuccessResponse<LeadListItem[]>>('/leads', { params: listQuery(params) });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async summary(filters: LeadFilters): Promise<LeadStatusSummary> {
    const response = await api.get<ApiSuccessResponse<LeadStatusSummary>>('/leads/summary', { params: filters });
    return response.data.data;
  },

  async kanban(filters: LeadFilters): Promise<LeadKanbanColumn[]> {
    const response = await api.get<ApiSuccessResponse<LeadKanbanColumn[]>>('/leads/kanban', {
      params: { ...filters, perColumn: KANBAN_PER_COLUMN },
    });
    return response.data.data;
  },

  /** Lead bahosi va u qanday yig'ilgani (omillar ro'yxati bilan) */
  async score(id: string): Promise<LeadScoreResult> {
    const response = await api.get<ApiSuccessResponse<LeadScoreResult>>(`/leads/${id}/score`);
    return response.data.data;
  },

  async assignmentRules(): Promise<AssignmentRule[]> {
    const response = await api.get<ApiSuccessResponse<AssignmentRule[]>>('/leads/assignment-rules');
    return response.data.data;
  },

  async saveAssignmentRules(rules: AssignmentRulePayload[]): Promise<MessageResult<AssignmentRule[]>> {
    return withMessage(await api.put<ApiSuccessResponse<AssignmentRule[]>>('/leads/assignment-rules', { rules }));
  },

  async get(id: string): Promise<LeadDetail> {
    const response = await api.get<ApiSuccessResponse<LeadDetail>>(`/leads/${id}`);
    return response.data.data;
  },

  async create(payload: CreateLeadPayload): Promise<MessageResult<LeadDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<LeadDetail>>('/leads', payload));
  },

  async update(id: string, payload: LeadPayload): Promise<MessageResult<LeadDetail>> {
    return withMessage(await api.put<ApiSuccessResponse<LeadDetail>>(`/leads/${id}`, payload));
  },

  async setStatus(id: string, payload: UpdateLeadStatusPayload): Promise<MessageResult<LeadDetail>> {
    return withMessage(await api.patch<ApiSuccessResponse<LeadDetail>>(`/leads/${id}/status`, payload));
  },

  async assign(id: string, assignedToId: string | null): Promise<MessageResult<LeadDetail>> {
    return withMessage(await api.patch<ApiSuccessResponse<LeadDetail>>(`/leads/${id}/assign`, { assignedToId }));
  },

  async remove(id: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/leads/${id}`);
    return response.data.message;
  },

  async activities(id: string, page: number): Promise<Paginated<LeadActivity>> {
    const limit = 30;
    const response = await api.get<ApiSuccessResponse<LeadActivity[]>>(`/leads/${id}/activities`, { params: { page, limit } });
    const items = response.data.data;
    return { items, meta: response.data.meta ?? { page, limit, total: items.length, totalPages: 1 } };
  },

  async notes(id: string): Promise<LeadNote[]> {
    const response = await api.get<ApiSuccessResponse<LeadNote[]>>(`/leads/${id}/notes`);
    return response.data.data;
  },

  async addNote(id: string, content: string): Promise<LeadNote> {
    const response = await api.post<ApiSuccessResponse<LeadNote>>(`/leads/${id}/notes`, { content });
    return response.data.data;
  },

  async deleteNote(id: string, noteId: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/leads/${id}/notes/${noteId}`);
    return response.data.message;
  },
};
