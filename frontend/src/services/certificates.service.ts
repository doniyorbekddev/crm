import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse, Paginated } from '@/types/api';
import type { Certificate, CertificateVerification } from '@/types/certificate';

export const certificatesService = {
  async list(params: { page: number; limit: number; studentId?: string }): Promise<Paginated<Certificate>> {
    const response = await api.get<ApiSuccessResponse<Certificate[]>>('/certificates', { params });
    const items = response.data.data;
    return {
      items,
      meta: response.data.meta ?? { page: params.page, limit: params.limit, total: items.length, totalPages: 1 },
    };
  },

  async issue(payload: { studentId: string; completionDate?: string; percentage?: number; note?: string }): Promise<MessageResult<Certificate>> {
    const response = await api.post<ApiSuccessResponse<Certificate>>('/certificates', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async revoke(id: string, reason: string): Promise<MessageResult<Certificate>> {
    const response = await api.post<ApiSuccessResponse<Certificate>>(`/certificates/${id}/revoke`, { reason });
    return { data: response.data.data, message: response.data.message };
  },

  /** Ochiq tekshiruv — token orqali, autentifikatsiyasiz */
  async verify(token: string): Promise<CertificateVerification> {
    const response = await api.get<ApiSuccessResponse<CertificateVerification>>(`/certificates/verify/${token}`, {
      // Tekshiruv sahifasi kirмаган foydalanuvchiga ham ochiq — token yangilanishi kerak emas
      skipAuthRefresh: true,
    });
    return response.data.data;
  },
};
