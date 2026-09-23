import { Outlet } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { useCurrentUserSync } from '@/hooks/useCurrentUserSync';
import { useLogout } from '@/hooks/useLogout';
import { useAuthStore } from '@/store/auth.store';

/**
 * Kabinet (o'quvchi/ota-ona) uchun soddalashtirilgan ko'rinish:
 * xodimlar paneli, sidebar va global qidiruv bo'lmaydi.
 */
export function PortalLayout() {
  useCurrentUserSync();
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  return (
    <div className="min-h-dvh bg-app">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm text-fg-muted sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
            <Button variant="secondary" onClick={() => logout.mutate()} loading={logout.isPending}>
              Chiqish
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export default PortalLayout;
