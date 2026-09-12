import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { SearchResult } from '@/types/search';

export const searchService = {
  async search(query: string): Promise<SearchResult> {
    const response = await api.get<ApiSuccessResponse<SearchResult>>('/search', { params: { q: query } });
    return response.data.data;
  },
};
