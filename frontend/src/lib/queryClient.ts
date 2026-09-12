import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

const MAX_RETRIES = 2;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // 4xx xatoliklarni (ruxsat yo‘q, topilmadi, validatsiya) qayta urinishning ma'nosi yo‘q.
        if (axios.isAxiosError(error) && error.response && error.response.status < 500) {
          return false;
        }
        return failureCount < MAX_RETRIES;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
