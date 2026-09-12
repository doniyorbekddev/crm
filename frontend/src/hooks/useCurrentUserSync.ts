import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '@/lib/queryKeys';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

/**
 * Joriy xodim ma'lumotlari va ruxsatlarini yangilab turadi — admin rolni yoki ruxsatlarni
 * o‘zgartirsa, menyu va sahifalar qayta kirishsiz yangilanadi (oynaga qaytilganda va har 5 daqiqada).
 */
export function useCurrentUserSync(): void {
  const status = useAuthStore((state) => state.status);

  const { data } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authService.me,
    enabled: status === 'authenticated',
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    if (data) useAuthStore.getState().setUser(data);
  }, [data]);
}
