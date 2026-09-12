import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useThemeStore } from '@/store/theme.store';
import type { Theme } from '@/store/theme.store';

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Yorug‘ mavzu', icon: Sun },
  { value: 'dark', label: 'Qorong‘i mavzu', icon: Moon },
  { value: 'system', label: 'Tizim sozlamasi', icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Mavzuni tanlash"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5', className)}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-md text-fg-muted transition-colors hover:text-fg',
              'outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              active && 'bg-surface text-fg shadow-sm',
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
