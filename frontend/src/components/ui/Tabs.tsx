import { createContext, useContext, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
  variant: 'underline' | 'pill';
  panels: boolean;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab/TabList/TabPanel faqat <Tabs> ichida ishlatiladi');
  return context;
}

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '_');

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  /** `underline` — sahifa bo'limlari; `pill` — ixcham almashtirgich (karta ichida, filtr) */
  variant?: 'underline' | 'pill';
  /**
   * `false` — tablar filtr sifatida ishlatiladi (`TabPanel` yo'q, mazmun tashqarida — masalan jadval):
   * mavjud bo'lmagan panelga `aria-controls` qo'yilmaydi.
   */
  panels?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Tablar (WAI-ARIA tabs): ←/→ — qo'shni tab, Home/End — birinchi/oxirgi; fokus faqat faol tabda (roving tabindex).
 *
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabList label="O‘quvchi bo‘limlari">
 *       <Tab value="overview">Umumiy</Tab>
 *       <Tab value="payments" count={3}>To‘lovlar</Tab>
 *     </TabList>
 *     <TabPanel value="overview">…</TabPanel>
 *   </Tabs>
 */
export function Tabs({ value, onValueChange, variant = 'underline', panels = true, children, className }: TabsProps) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId, variant, panels }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const { variant } = useTabs();
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
    const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1 || tabs.length === 0) return;
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (current - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next === -1) return;
    event.preventDefault();
    tabs[next]!.focus();
    tabs[next]!.click();
  };

  return (
    // Tablar ko'p bo'lsa (yoki telefon) — qator gorizontal aylanadi, sahifa emas
    <div className={cn('overflow-x-auto', variant === 'underline' && 'border-b border-border', className)}>
      <div
        ref={ref}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn('flex w-max min-w-full', variant === 'underline' ? 'gap-5' : 'gap-1 rounded-control bg-surface-muted p-1 sm:w-max sm:min-w-0')}
      >
        {children}
      </div>
    </div>
  );
}

interface TabProps {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Yonidagi son (masalan, yozuvlar soni) */
  count?: number;
  /** Son e'tibor talab qilsa (masalan muddati o'tganlar) */
  countTone?: 'default' | 'danger';
  disabled?: boolean;
}

export function Tab({ value, children, icon, count, countTone = 'default', disabled = false }: TabProps) {
  const { value: active, onValueChange, baseId, variant, panels } = useTabs();
  const selected = active === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${safeId(value)}`}
      aria-selected={selected}
      aria-controls={panels ? `${baseId}-panel-${safeId(value)}` : undefined}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cn(
        'focus-ring inline-flex shrink-0 items-center gap-2 text-body font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'underline'
          ? cn(
              '-mb-px h-10 border-b-2 px-0.5',
              selected ? 'border-brand-600 text-fg' : 'border-transparent text-fg-muted hover:border-border hover:text-fg',
            )
          : cn('h-8 rounded-chip px-3', selected ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'),
      )}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-chip px-1.5 text-caption tabular-nums',
            countTone === 'danger' && count > 0 ? 'bg-danger-subtle text-danger' : selected ? 'bg-primary-subtle text-primary' : 'bg-surface-muted text-fg-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
  /** `true` — faol bo'lmaganda ham DOM'da qoladi (forma holati saqlanishi kerak bo'lsa) */
  keepMounted?: boolean;
}

export function TabPanel({ value, children, className, keepMounted = false }: TabPanelProps) {
  const { value: active, baseId } = useTabs();
  const selected = active === value;
  if (!selected && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${safeId(value)}`}
      aria-labelledby={`${baseId}-tab-${safeId(value)}`}
      hidden={!selected}
      tabIndex={0}
      className={cn('focus-ring rounded-chip', className)}
    >
      {children}
    </div>
  );
}
