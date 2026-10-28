import { BookOpen, BookOpenCheck, CalendarCheck, FileBarChart, FileCheck, Home, MoreHorizontal, Settings, Sparkles, Target, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useActiveIndicator } from '@/hooks/useActiveIndicator';
import { cn } from '@/lib/cn';

export interface PortalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Faqat aniq mos kelganda faol (bosh sahifa uchun) */
  end?: boolean;
  /** Telefonda pastki panelda turadi; qolganlari "Yana" ichida */
  primary?: boolean;
}

/** Kabinet bo‘limlari — kompyuterda sarlavha ostidagi tablar, telefonda pastki panel + "Yana" */
export const PORTAL_NAV_ITEMS: readonly PortalNavItem[] = [
  { to: '/portal', label: 'Bosh sahifa', icon: Home, end: true, primary: true },
  { to: '/portal/course', label: 'Kurs', icon: BookOpen, primary: true },
  { to: '/portal/homework', label: 'Vazifalar', icon: BookOpenCheck, primary: true },
  { to: '/portal/exams', label: 'Imtihonlar', icon: FileCheck, primary: true },
  { to: '/portal/progress', label: 'Progress', icon: Target },
  { to: '/portal/attendance', label: 'Davomat', icon: CalendarCheck },
  { to: '/portal/payments', label: 'To‘lovlar', icon: Wallet },
  { to: '/portal/weekly-report', label: 'Hisobot', icon: FileBarChart },
  { to: '/portal/xp', label: 'XP', icon: Sparkles },
  { to: '/portal/settings', label: 'Sozlamalar', icon: Settings },
];

const PRIMARY = PORTAL_NAV_ITEMS.filter((item) => item.primary);
const SECONDARY = PORTAL_NAV_ITEMS.filter((item) => !item.primary);

/** Kompyuter: gorizontal tablar */
export function PortalTabs({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  // Faol bo'lim ostidagi gradient chiziq bo'limdan bo'limga sirpanadi
  useActiveIndicator(listRef, indicatorRef, { selector: 'a[aria-current="page"]', mode: 'underline' }, [pathname]);
  return (
    <nav aria-label="Kabinet bo‘limlari" className={cn('hidden sm:block print:hidden', className)}>
      <div ref={listRef} className="group/tabs relative overflow-x-auto">
        <span
          ref={indicatorRef}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-pill bg-gradient-brand opacity-0 transition-[transform,opacity] duration-slow ease-out"
        />
        <ul className="flex gap-5">
          {PORTAL_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'focus-ring inline-flex h-10 items-center gap-2 border-b-2 px-0.5 text-body font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'border-primary text-fg group-data-[indicator=ready]/tabs:border-transparent'
                      : 'border-transparent text-fg-muted hover:border-border hover:text-fg',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

const bottomLinkClass = (isActive: boolean) =>
  cn(
    'focus-ring flex w-full flex-col items-center gap-0.5 px-1 py-2 text-overline tracking-normal transition-colors',
    isActive ? 'text-primary' : 'text-fg-muted',
  );

/** Telefon: pastki panel — 4 ta asosiy bo‘lim va "Yana" menyusi (bosh barmoq yetadigan joyda) */
export function PortalBottomBar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const moreActive = SECONDARY.some((item) => location.pathname.startsWith(item.to));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <nav
      aria-label="Kabinet bo‘limlari"
      className="glass fixed inset-x-0 bottom-0 z-header border-t border-border pb-[env(safe-area-inset-bottom)] sm:hidden print:hidden"
    >
      <div ref={containerRef} className="relative">
        {open && (
          <ul id="portal-more-menu" className="absolute right-2 bottom-full mb-2 w-52 origin-bottom-right animate-menu-in overflow-hidden rounded-control border border-border bg-surface-elevated py-1 shadow-md">
            {SECONDARY.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn('focus-ring-inset flex items-center gap-3 px-4 py-2.5 text-body transition-colors', isActive ? 'bg-primary-subtle text-primary' : 'text-fg hover:bg-primary-subtle/60 focus-visible:bg-primary-subtle/60')
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        <ul className="grid grid-cols-5">
          {PRIMARY.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => bottomLinkClass(isActive)}>
                <Icon className="size-5" aria-hidden />
                <span className="truncate">{label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="portal-more-menu"
              onClick={() => setOpen((value) => !value)}
              className={bottomLinkClass(moreActive || open)}
            >
              <MoreHorizontal className="size-5" aria-hidden />
              <span>Yana</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
