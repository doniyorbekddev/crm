import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { SearchInput } from './SearchInput';

interface FilterBarProps {
  /** Qidiruv maydoni (har doim ko'rinadi — telefonda ham) */
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string };
  /** Filtr boshqaruvlari: `<FilterField>` ichida Select, MultiSelect, DateRangePicker … */
  children?: ReactNode;
  /** Qo'llangan filtrlar soni (qidiruvdan tashqari) */
  activeCount?: number;
  onClear?: () => void;
  /** O'ng tomondagi amallar: eksport, ustun sozlamasi, ko'rinish almashtirgich */
  actions?: ReactNode;
  className?: string;
}

/**
 * Ro'yxat sahifasi filtrlari. Kompyuterda — bir qator; telefonda filtrlar "Filtrlar" tugmasi ortidagi
 * pastki panelga yig'iladi (qidiruv tashqarida qoladi). Filtr holati va so'rov chaqiruvchida.
 */
export function FilterBar({ search, children, activeCount = 0, onClear, actions, className }: FilterBarProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);
  const hasFilters = Boolean(children);

  const clear = onClear && activeCount > 0 && (
    <Button variant="ghost" size="sm" leftIcon={<X className="size-3.5" aria-hidden />} onClick={onClear}>
      Tozalash
    </Button>
  );

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {search && (
        <SearchInput
          value={search.value}
          onChange={search.onChange}
          {...(search.placeholder ? { placeholder: search.placeholder } : {})}
          {...(search.label ? { label: search.label } : {})}
          className="min-w-0 flex-1 sm:max-w-xs sm:flex-none sm:basis-72"
        />
      )}
      {hasFilters &&
        (desktop ? (
          <>
            {children}
            {clear}
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              className="h-10"
              leftIcon={<SlidersHorizontal className="size-4" aria-hidden />}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
            >
              Filtrlar
              {activeCount > 0 && (
                <span className="rounded-chip bg-primary-subtle px-1.5 text-caption font-medium text-primary tabular-nums">{activeCount}</span>
              )}
            </Button>
            <Drawer
              open={open}
              title="Filtrlar"
              onClose={() => setOpen(false)}
              footer={
                <>
                  {onClear && (
                    <Button variant="secondary" disabled={activeCount === 0} onClick={onClear}>
                      Tozalash
                    </Button>
                  )}
                  <Button onClick={() => setOpen(false)}>Natijani ko‘rsatish</Button>
                </>
              }
            >
              <div className="grid gap-3">{children}</div>
            </Drawer>
          </>
        ))}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Bitta filtr boshqaruvi: telefonda to'liq kenglik, kompyuterda — `className` dagi kenglik (standart 176px) */
export function FilterField({ children, className = 'sm:w-44' }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full', className)}>{children}</div>;
}
