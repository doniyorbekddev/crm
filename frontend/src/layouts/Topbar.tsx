import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useUiStore } from '@/store/ui.store';
import { NotificationBell } from './NotificationBell';
import { UserMenu } from './UserMenu';

export function Topbar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const [searchOpen, setSearchOpen] = useState(false);

  // Ctrl+K / Cmd+K — global qidiruv
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg lg:hidden"
          aria-label="Menyuni ochish"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg lg:grid"
          aria-label={collapsed ? 'Menyuni kengaytirish' : 'Menyuni yig‘ish'}
          title={collapsed ? 'Menyuni kengaytirish' : 'Menyuni yig‘ish'}
        >
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Global qidiruv"
          className="hidden h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:flex"
        >
          <Search className="size-4" aria-hidden />
          <span>Qidirish…</span>
          <kbd className="ml-2 rounded border border-border px-1.5 text-[11px] text-fg-subtle">Ctrl K</kbd>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Global qidiruv"
          className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-muted hover:text-fg sm:hidden"
        >
          <Search className="size-5" aria-hidden />
        </button>
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
