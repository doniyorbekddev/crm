import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { Branch, BranchPayload } from '@/types/branch';

function withMessage<T>(response: { data: ApiSuccessResponse<T> }): MessageResult<T> {
  return { data: response.data.data, message: response.data.message };
}

export const branchesService = {
  /** Xodim ko‘ra oladigan filiallar (branch.view_all bo‘lmasa — bittasi) */
  async list(): Promise<Branch[]> {
    const response = await api.get<ApiSuccessResponse<Branch[]>>('/branches');
    return response.data.data;
  },

  async create(payload: BranchPayload): Promise<MessageResult<Branch>> {
    return withMessage(await api.post<ApiSuccessResponse<Branch>>('/branches', payload));
  },

  async update(id: string, payload: Partial<BranchPayload>): Promise<MessageResult<Branch>> {
    return withMessage(await api.put<ApiSuccessResponse<Branch>>(`/branches/${id}`, payload));
  },
};
