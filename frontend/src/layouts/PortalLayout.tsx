import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCurrentUserSync } from '@/hooks/useCurrentUserSync';
import { useLogout } from '@/hooks/useLogout';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { useAuthStore } from '@/store/auth.store';
import { NotificationBell } from './NotificationBell';
import { PortalProvider, usePortal } from './PortalContext';
import { PortalBottomBar, PortalTabs } from './PortalNav';
import { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';

/**
 * Kabinet (o‘quvchi/ota-ona) uchun soddalashtirilgan ko‘rinish:
 * xodimlar paneli, sidebar va global qidiruv bo‘lmaydi.
 *
 * Ota-onaning farzand tanlovi shu yerda — barcha bo‘limlar bitta tanlovga bo‘ysunadi.
 */
export function PortalLayout() {
  useCurrentUserSync();
  const meQuery = useQuery({ queryKey: queryKeys.portal.me, queryFn: () => portalService.me() });

  return (
    <div className="min-h-dvh bg-app">
      <PortalHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-6">
        {meQuery.isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : meQuery.isError ? (
          <ErrorState error={meQuery.error} onRetry={() => void meQuery.refetch()} />
        ) : meQuery.data.children.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Ma’lumot topilmadi"
            description="Hisobingizga o‘quvchi biriktirilmagan. O‘quv markazga murojaat qiling."
          />
        ) : (
          <PortalProvider me={meQuery.data}>
            <PortalToolbar />
            <Outlet />
          </PortalProvider>
        )}
      </main>
      <PortalBottomBar />
    </div>
  );
}

function PortalHeader() {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <BrandMark />
        <div className="flex items-center gap-2">
          <NotificationBell listPath="/portal/notifications" />
          <ThemeToggle className="hidden sm:inline-flex" />
          <span className="hidden text-sm text-fg-muted md:inline">
            {user?.firstName} {user?.lastName}
          </span>
          <Button variant="secondary" onClick={() => logout.mutate()} loading={logout.isPending}>
            Chiqish
          </Button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4">
        <PortalTabs className="pb-2" />
      </div>
    </header>
  );
}

/** Kabinet qidiruvi (TZ §45) va farzand tanlovi — bitta qatorda */
function PortalToolbar() {
  const { activeChild } = usePortal();
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <Button variant="secondary" leftIcon={<SearchIcon className="size-4" aria-hidden />} onClick={() => setSearchOpen(true)}>
        Qidirish
      </Button>
      <ChildSwitcher />
      <GlobalSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        search={(query) => portalService.search(query, activeChild)}
        scopeKey={`portal:${activeChild}`}
        placeholder="Vazifa, imtihon, dars yoki sertifikat…"
      />
    </div>
  );
}

/** Bir nechta farzandli ota-ona uchun — tanlov barcha bo‘limlarga taalluqli */
function ChildSwitcher() {
  const { me, activeChild, setActiveChild } = usePortal();
  if (me.kind !== 'PARENT' || me.children.length < 2) return null;

  return (
    <div className="flex items-center justify-end">
      <Select
        value={activeChild}
        onChange={(event) => setActiveChild(event.target.value)}
        aria-label="Farzandni tanlash"
        wrapperClassName="w-full sm:w-64"
      >
        {me.children.map((child) => (
          <option key={child.studentId} value={child.studentId}>
            {child.firstName} {child.lastName}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default PortalLayout;
