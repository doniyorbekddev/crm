import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { PortalMe, PortalProfile, PortalSchedule } from '@/types/portal';

/**
 * Kabinet API'si. Hech qanday `studentId` ga ishonilmaydi — backend har so‘rovda
 * foydalanuvchi bilan o‘quvchi bog‘lanishini qayta tekshiradi.
 */
export const portalService = {
  async me(): Promise<PortalMe> {
    const response = await api.get<ApiSuccessResponse<PortalMe>>('/portal/me');
    return response.data.data;
  },

  async profile(studentId?: string): Promise<PortalProfile> {
    const response = await api.get<ApiSuccessResponse<PortalProfile>>('/portal/profile', { params: { studentId } });
    return response.data.data;
  },

  async schedule(studentId?: string): Promise<PortalSchedule> {
    const response = await api.get<ApiSuccessResponse<PortalSchedule>>('/portal/schedule', { params: { studentId } });
    return response.data.data;
  },
};
