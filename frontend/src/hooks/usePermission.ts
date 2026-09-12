import { useAuthStore } from '@/store/auth.store';
import { hasPermission } from '@/utils/permissions';

export function usePermission(permission: string): boolean {
  const user = useAuthStore((state) => state.user);
  return hasPermission(user, permission);
}
