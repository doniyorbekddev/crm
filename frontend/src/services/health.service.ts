import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  database: 'up' | 'down';
  uptimeSeconds: number;
  timestamp: string;
}

/** Fon vazifasi salomatligi (TZ 3.1 §44) — `settings.manage` */
export interface JobHealth {
  job: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export const healthService = {
  async jobs(): Promise<JobHealth[]> {
    const response = await api.get<ApiSuccessResponse<JobHealth[]>>('/health/jobs');
    return response.data.data;
  },

  async check(): Promise<HealthStatus> {
    // Baza ishlamasa API 503 qaytaradi — bu holatni ham ko‘rsatish uchun javobni xatolik deb hisoblamaymiz.
    const response = await api.get<ApiSuccessResponse<HealthStatus>>('/health', {
      validateStatus: (status) => status === 200 || status === 503,
    });
    return response.data.data;
  },
};
