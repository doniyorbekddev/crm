import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { ThemeToggle } from '@/components/ThemeToggle';
import { IconButton } from '@/components/ui/IconButton';
import { useUiStore } from '@/store/ui.store';
import { BranchSelect } from './BranchSelect';
import { NotificationBell } from './NotificationBell';
import { ShellBreadcrumb } from './ShellBreadcrumb';
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
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton label="Menyuni ochish" tooltip={false} size="lg" onClick={() => setMobileOpen(true)} className="lg:hidden">
          <Menu aria-hidden />
        </IconButton>
        <IconButton
          label={collapsed ? 'Menyuni kengaytirish' : 'Menyuni yig‘ish'}
          tooltipSide="bottom"
          onClick={toggleCollapsed}
          className="hidden lg:inline-grid"
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </IconButton>
        <ShellBreadcrumb className="hidden min-w-0 md:block lg:ml-1" />
      </div>
      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Global qidiruv"
          className="focus-ring hidden h-9 w-56 items-center gap-2 rounded-control border border-border bg-surface-muted/60 px-3 text-body text-fg-muted transition-colors hover:border-fg-subtle/60 hover:text-fg sm:flex xl:w-72"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 text-left">Qidirish…</span>
          <kbd className="rounded-sm border border-border bg-surface px-1.5 font-sans text-overline tracking-normal text-fg-subtle">Ctrl K</kbd>
        </button>
        <IconButton label="Global qidiruv" tooltip={false} size="lg" onClick={() => setSearchOpen(true)} className="sm:hidden">
          <Search aria-hidden />
        </IconButton>
        <BranchSelect />
        <NotificationBell />
        <ThemeToggle className="hidden sm:inline-flex" />
        <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
        <UserMenu />
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
