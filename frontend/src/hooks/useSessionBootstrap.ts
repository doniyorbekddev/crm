import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { refreshSession } from '@/lib/api';
import { subscribeToLogout } from '@/lib/authChannel';
import { useAuthStore } from '@/store/auth.store';

/**
 * Ilova ochilganda sessiyani refresh cookie orqali tiklaydi va boshqa tabdagi
 * "chiqish" hodisasini tinglaydi. Ilova ildizida bir marta chaqiriladi.
 */
export function useSessionBootstrap(): void {
  const status = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'checking') {
      void refreshSession();
    }
  }, [status]);

  useEffect(
    () =>
      subscribeToLogout(() => {
        useAuthStore.getState().clearSession();
        queryClient.clear();
      }),
    [queryClient],
  );
}
