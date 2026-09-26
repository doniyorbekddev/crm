import { api } from '@/lib/api';
import type { MessageResult } from '@/services/auth.service';
import type { ApiSuccessResponse } from '@/types/api';
import type { BroadcastItem, BroadcastMedia, BroadcastPayload, BroadcastPreview } from '@/types/broadcast';

/** Ommaviy Telegram xabari (TZ 3.1 GAP-15) — yuborish navbat orqali, statistika serverda */
export const broadcastsService = {
  async list(): Promise<BroadcastItem[]> {
    const response = await api.get<ApiSuccessResponse<BroadcastItem[]>>('/telegram/broadcasts');
    return response.data.data;
  },

  async preview(payload: BroadcastPayload): Promise<BroadcastPreview> {
    const response = await api.post<ApiSuccessResponse<BroadcastPreview>>('/telegram/broadcasts/preview', payload);
    return response.data.data;
  },

  async send(payload: BroadcastPayload): Promise<MessageResult<BroadcastItem>> {
    const response = await api.post<ApiSuccessResponse<BroadcastItem>>('/telegram/broadcasts', payload);
    return { data: response.data.data, message: response.data.message };
  },

  /** Rasm (PNG/JPG/WEBP) yoki PDF — xom tana, nomi sarlavhada; javobdagi token yuborishda ishlatiladi */
  async uploadMedia(file: File): Promise<BroadcastMedia> {
    const response = await api.post<ApiSuccessResponse<BroadcastMedia>>('/telegram/broadcasts/media', file, {
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return response.data.data;
  },
};
