import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { broadcastLogout } from '@/lib/authChannel';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';

/** Serverdagi sessiya bekor qilinmasa ham (masalan, internet yo‘q) foydalanuvchi baribir chiqariladi. */
export function useLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authService.logout,
    onSettled: () => {
      navigate('/login', { replace: true });
      useAuthStore.getState().clearSession();
      queryClient.clear();
      broadcastLogout();
      toast.success('Tizimdan chiqdingiz');
    },
  });
}
