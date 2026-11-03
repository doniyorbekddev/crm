import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type {
  AssetDetail,
  AssetEventPayload,
  AssetList,
  CandidateDetail,
  CandidatePayload,
  CandidateStage,
  Candidate,
  Checklist,
  ChecklistDetail,
  ChecklistKind,
  ChecklistStatus,
  ComplaintDetail,
  ComplaintList,
  ComplaintPayload,
  ComplaintStatus,
  Department,
  EmploymentHistoryEntry,
  KnowledgeDetail,
  KnowledgeItem,
  KnowledgePayload,
  KnowledgeStatus,
  OrgStaffUser,
  OrgStructure,
  Position,
} from '@/types/org';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await api.get<ApiSuccessResponse<T>>(url, params ? { params } : undefined);
  return response.data.data;
}

export const orgService = {
  structure: () => get<OrgStructure>('/org/structure'),
  /** Faol xodim hisoblari — rahbar va mas'ul tanlash uchun */
  people: () => get<OrgStaffUser[]>('/org/people'),

  // ---- katalog
  departments: (includeInactive = false) => get<Department[]>('/org/departments', includeInactive ? { includeInactive: 'true' } : undefined),
  async saveDepartment(id: string | null, payload: Record<string, unknown>): Promise<MessageResult<Department>> {
    return withMessage(id ? await api.put<ApiSuccessResponse<Department>>(`/org/departments/${id}`, payload) : await api.post<ApiSuccessResponse<Department>>('/org/departments', payload));
  },
  positions: () => get<Position[]>('/org/positions'),
  async updatePosition(key: string, payload: Record<string, unknown>): Promise<MessageResult<Position>> {
    return withMessage(await api.patch<ApiSuccessResponse<Position>>(`/org/positions/${key}`, payload));
  },
  async saveResponsibility(key: string, id: string | null, payload: Record<string, unknown>): Promise<MessageResult<Position>> {
    return withMessage(
      id ? await api.put<ApiSuccessResponse<Position>>(`/org/positions/${key}/responsibilities/${id}`, payload) : await api.post<ApiSuccessResponse<Position>>(`/org/positions/${key}/responsibilities`, payload),
    );
  },
  employeeHistory: (employeeId: string) => get<EmploymentHistoryEntry[]>(`/org/employees/${employeeId}/history`),

  // ---- murojaatlar
  complaints: (params: Record<string, unknown>) => get<ComplaintList>('/org/complaints', params),
  complaint: (id: string) => get<ComplaintDetail>(`/org/complaints/${id}`),
  complaintAssignees: () => get<OrgStaffUser[]>('/org/complaints/assignees'),
  async createComplaint(payload: ComplaintPayload): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>('/org/complaints', payload));
  },
  async createAppeal(payload: Pick<ComplaintPayload, 'category' | 'severity' | 'title' | 'description' | 'subjectUserId' | 'confidential'>): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>('/org/complaints/appeal', payload));
  },
  async assignComplaint(id: string, assigneeId: string, note?: string): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>(`/org/complaints/${id}/assign`, { assigneeId, ...(note ? { note } : {}) }));
  },
  async complaintStatus(id: string, status: Exclude<ComplaintStatus, 'NEW'>, note?: string): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>(`/org/complaints/${id}/status`, { status, ...(note ? { note } : {}) }));
  },
  async escalateComplaint(id: string, note: string): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>(`/org/complaints/${id}/escalate`, { note }));
  },
  async commentComplaint(id: string, note: string): Promise<MessageResult<ComplaintDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ComplaintDetail>>(`/org/complaints/${id}/comments`, { note }));
  },

  // ---- aktivlar
  assets: (params: Record<string, unknown>) => get<AssetList>('/org/assets', params),
  asset: (id: string) => get<AssetDetail>(`/org/assets/${id}`),
  async createAsset(payload: Record<string, unknown>): Promise<MessageResult<AssetDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<AssetDetail>>('/org/assets', payload));
  },
  async updateAsset(id: string, payload: Record<string, unknown>): Promise<MessageResult<AssetDetail>> {
    return withMessage(await api.patch<ApiSuccessResponse<AssetDetail>>(`/org/assets/${id}`, payload));
  },
  async assetEvent(id: string, payload: AssetEventPayload): Promise<MessageResult<AssetDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<AssetDetail>>(`/org/assets/${id}/events`, payload));
  },

  // ---- bilimlar bazasi
  knowledge: (params: Record<string, unknown>) => get<{ items: KnowledgeItem[]; pendingAck: number; manage: boolean }>('/org/knowledge', params),
  article: (id: string) => get<KnowledgeDetail>(`/org/knowledge/${id}`),
  knowledgeRoles: () => get<Array<{ id: string; name: string }>>('/org/knowledge/roles'),
  articleVersion: (id: string, version: number) => get<{ version: number; title: string; body: string; videoUrl: string | null; changeNote: string | null; createdAt: string }>(`/org/knowledge/${id}/versions/${version}`),
  async saveArticle(id: string | null, payload: KnowledgePayload): Promise<MessageResult<KnowledgeDetail>> {
    return withMessage(id ? await api.put<ApiSuccessResponse<KnowledgeDetail>>(`/org/knowledge/${id}`, payload) : await api.post<ApiSuccessResponse<KnowledgeDetail>>('/org/knowledge', payload));
  },
  async articleStatus(id: string, status: KnowledgeStatus): Promise<MessageResult<KnowledgeDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<KnowledgeDetail>>(`/org/knowledge/${id}/status`, { status }));
  },
  async acknowledge(id: string): Promise<MessageResult<KnowledgeDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<KnowledgeDetail>>(`/org/knowledge/${id}/acknowledge`, {}));
  },

  // ---- HR
  candidates: (params: Record<string, unknown>) => get<{ items: Candidate[]; counts: Record<CandidateStage, number> }>('/org/candidates', params),
  candidate: (id: string) => get<CandidateDetail>(`/org/candidates/${id}`),
  async saveCandidate(id: string | null, payload: CandidatePayload): Promise<MessageResult<CandidateDetail>> {
    return withMessage(id ? await api.put<ApiSuccessResponse<CandidateDetail>>(`/org/candidates/${id}`, payload) : await api.post<ApiSuccessResponse<CandidateDetail>>('/org/candidates', payload));
  },
  async moveCandidate(id: string, stage: CandidateStage, note?: string): Promise<MessageResult<CandidateDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<CandidateDetail>>(`/org/candidates/${id}/stage`, { stage, ...(note ? { note } : {}) }));
  },
  async hireCandidate(id: string, payload: Record<string, unknown>): Promise<MessageResult<CandidateDetail & { checklistId: string }>> {
    return withMessage(await api.post<ApiSuccessResponse<CandidateDetail & { checklistId: string }>>(`/org/candidates/${id}/hire`, payload));
  },
  checklists: (params: { kind?: ChecklistKind; status?: ChecklistStatus }) => get<Checklist[]>('/org/checklists', params),
  checklist: (id: string) => get<ChecklistDetail>(`/org/checklists/${id}`),
  async createChecklist(payload: Record<string, unknown>): Promise<MessageResult<ChecklistDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ChecklistDetail>>('/org/checklists', payload));
  },
  async checklistItem(id: string, itemId: string, done: boolean, note?: string): Promise<MessageResult<ChecklistDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ChecklistDetail>>(`/org/checklists/${id}/items/${itemId}`, { done, ...(note ? { note } : {}) }));
  },
  async checklistAction(id: string, action: 'handover' | 'revoke-access' | 'complete' | 'cancel', body: Record<string, unknown> = {}): Promise<MessageResult<ChecklistDetail>> {
    return withMessage(await api.post<ApiSuccessResponse<ChecklistDetail>>(`/org/checklists/${id}/${action}`, body));
  },
};
