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

export const healthService = {
  async check(): Promise<HealthStatus> {
    // Baza ishlamasa API 503 qaytaradi — bu holatni ham ko‘rsatish uchun javobni xatolik deb hisoblamaymiz.
    const response = await api.get<ApiSuccessResponse<HealthStatus>>('/health', {
      validateStatus: (status) => status === 200 || status === 503,
    });
    return response.data.data;
  },
};
