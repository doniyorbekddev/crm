import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { PortalLessons, PortalMe, PortalProfile, PortalSchedule } from '@/types/portal';
import type { StudentCurriculumProgress } from '@/types/curriculum';
import type { Certificate } from '@/types/certificate';

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

  /** Kelgusi darslar va o‘qituvchi */
  async lessons(studentId?: string): Promise<PortalLessons> {
    const response = await api.get<ApiSuccessResponse<PortalLessons>>('/portal/lessons', { params: { studentId } });
    return response.data.data;
  },

  /** Kurs dasturi bo‘yicha progress */
  async curriculum(studentId?: string): Promise<StudentCurriculumProgress | null> {
    const response = await api.get<ApiSuccessResponse<StudentCurriculumProgress | null>>('/portal/curriculum', {
      params: { studentId },
    });
    return response.data.data;
  },

  async certificates(studentId?: string): Promise<Certificate[]> {
    const response = await api.get<ApiSuccessResponse<Certificate[]>>('/portal/certificates', { params: { studentId } });
    return response.data.data;
  },
};
