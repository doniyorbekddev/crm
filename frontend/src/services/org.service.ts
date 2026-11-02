import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { OrgStaffUser, OrgStructure } from '@/types/org';

export const orgService = {
  async structure(): Promise<OrgStructure> {
    const response = await api.get<ApiSuccessResponse<OrgStructure>>('/org/structure');
    return response.data.data;
  },

  /** Faol xodim hisoblari — rahbar va mas'ul tanlash uchun */
  async people(): Promise<OrgStaffUser[]> {
    const response = await api.get<ApiSuccessResponse<OrgStaffUser[]>>('/org/people');
    return response.data.data;
  },
};
