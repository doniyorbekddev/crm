import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import { hasPermission } from '@/utils/permissions';
import { NAV_SECTIONS } from './navigation';

export function Sidebar() {
  const user = useAuthStore((state) => state.user);
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const mobileOpen = useUiStore((state) => state.mobileSidebarOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileSidebarOpen);

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermission(user, item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" aria-hidden onClick={() => setMobileOpen(false)} />
      )}
      <aside
        aria-label="Asosiy menyu"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-[transform,width] duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <BrandMark showName={!collapsed} className={cn(collapsed && 'lg:mx-auto')} />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg lg:hidden"
            aria-label="Menyuni yopish"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p
                className={cn(
                  'mb-2 px-3 text-[11px] font-semibold tracking-wider text-fg-subtle uppercase',
                  collapsed && 'lg:sr-only',
                )}
              >
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      title={collapsed ? label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                          collapsed && 'lg:justify-center lg:px-0',
                          isActive
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200'
                            : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                        )
                      }
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      <span className={cn('truncate', collapsed && 'lg:sr-only')}>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
