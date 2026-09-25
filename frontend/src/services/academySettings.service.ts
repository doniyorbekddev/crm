import { api } from '@/lib/api';
import { appEnv } from '@/lib/env';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { AcademySettings, AcademySettingsPayload, Branding } from '@/types/settings';

export const academySettingsService = {
  async get(): Promise<AcademySettings> {
    const response = await api.get<ApiSuccessResponse<AcademySettings>>('/settings/academy');
    return response.data.data;
  },

  async save(payload: AcademySettingsPayload): Promise<MessageResult<AcademySettings>> {
    const response = await api.put<ApiSuccessResponse<AcademySettings>>('/settings/academy', payload);
    return { data: response.data.data, message: response.data.message };
  },

  async uploadLogo(file: File): Promise<MessageResult<AcademySettings>> {
    const response = await api.post<ApiSuccessResponse<AcademySettings>>('/settings/academy/logo', file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async removeLogo(): Promise<MessageResult<AcademySettings>> {
    const response = await api.delete<ApiSuccessResponse<AcademySettings>>('/settings/academy/logo');
    return { data: response.data.data, message: response.data.message };
  },

  /** Ochiq — kirishdan oldin ham ishlaydi */
  async branding(): Promise<Branding> {
    const response = await api.get<ApiSuccessResponse<Branding>>('/public/branding');
    return response.data.data;
  },
};

/** Backend nisbiy manzili ("/public/branding/logo?v=…") → to'liq URL */
export function brandingAssetUrl(path: string | null): string | null {
  return path ? `${appEnv.apiUrl}${path}` : null;
}
