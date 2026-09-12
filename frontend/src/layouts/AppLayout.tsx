import { Outlet } from 'react-router-dom';
import { useCurrentUserSync } from '@/hooks/useCurrentUserSync';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/store/ui.store';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export default function AppLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  useCurrentUserSync();

  return (
    <div className="min-h-full">
      <Sidebar />
      <div className={cn('flex min-h-full flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <Topbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
