import { BookOpenCheck, CalendarCheck, FileBarChart, FileCheck, Home, Settings, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';

export interface PortalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Faqat aniq mos kelganda faol (bosh sahifa uchun) */
  end?: boolean;
}

/** Kabinet bo‘limlari — telefonda pastki panel, kompyuterda sarlavha ostidagi tablar */
export const PORTAL_NAV_ITEMS: readonly PortalNavItem[] = [
  { to: '/portal', label: 'Bosh sahifa', icon: Home, end: true },
  { to: '/portal/homework', label: 'Vazifalar', icon: BookOpenCheck },
  { to: '/portal/exams', label: 'Imtihonlar', icon: FileCheck },
  { to: '/portal/attendance', label: 'Davomat', icon: CalendarCheck },
  { to: '/portal/payments', label: 'To‘lovlar', icon: Wallet },
  { to: '/portal/weekly-report', label: 'Hisobot', icon: FileBarChart },
  { to: '/portal/settings', label: 'Sozlamalar', icon: Settings },
];

/** Kompyuter: gorizontal tablar */
export function PortalTabs({ className }: { className?: string }) {
  return (
    <nav aria-label="Kabinet bo‘limlari" className={cn('hidden sm:block print:hidden', className)}>
      <ul className="flex gap-1 overflow-x-auto">
        {PORTAL_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  'outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isActive ? 'bg-brand-600 text-white' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Telefon: pastki panel — bosh barmoq bilan yetadigan joyda */
export function PortalBottomBar() {
  return (
    <nav
      aria-label="Kabinet bo‘limlari"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden"
    >
      <ul className="grid grid-cols-7">
        {PORTAL_NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-fg-muted',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              <span className="truncate">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
