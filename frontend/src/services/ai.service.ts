import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { AiAnswer, AiHistoryItem, AiTool } from '@/types/ai';

export const aiService = {
  async tools(): Promise<AiTool[]> {
    const response = await api.get<ApiSuccessResponse<AiTool[]>>('/ai/tools');
    return response.data.data;
  },

  async ask(question: string, toolKey?: string): Promise<AiAnswer> {
    const response = await api.post<ApiSuccessResponse<AiAnswer>>('/ai/ask', {
      question,
      ...(toolKey ? { toolKey } : {}),
    });
    return response.data.data;
  },

  async history(): Promise<AiHistoryItem[]> {
    const response = await api.get<ApiSuccessResponse<AiHistoryItem[]>>('/ai/history');
    return response.data.data;
  },
};
