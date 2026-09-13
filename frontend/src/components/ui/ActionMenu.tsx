import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface ActionMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Ekran o‘quvchilar uchun tugma nomi */
  label?: string;
  /** Berilsa — "…" o‘rniga matnli tugma (masalan, "Eksport") */
  trigger?: { label: string; icon: LucideIcon };
  disabled?: boolean;
}

const MENU_WIDTH = 208;
const ITEM_HEIGHT = 40;

/**
 * Jadval qatorlari uchun "…" menyusi. Menyu `document.body` ga chiziladi —
 * jadvalning `overflow` konteyneri uni kesib qo‘ymasligi uchun.
 */
export function ActionMenu({ items, label = 'Amallar', trigger, disabled = false }: ActionMenuProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = position !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (items.length === 0) return null;

  const toggle = () => {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = items.length * ITEM_HEIGHT + 8;
    const opensUp = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight;
    setPosition({
      top: opensUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={trigger ? undefined : label}
        disabled={disabled}
        className={cn(
          'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-60',
          trigger
            ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium text-fg shadow-xs hover:bg-surface-muted'
            : 'grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg',
        )}
      >
        {trigger ? (
          <>
            <trigger.icon className="size-4" aria-hidden />
            {trigger.label}
          </>
        ) : (
          <MoreHorizontal className="size-4" aria-hidden />
        )}
      </button>
      {position &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            {items.map(({ label: itemLabel, icon: Icon, onSelect, tone = 'default', disabled = false }) => (
              <button
                key={itemLabel}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  setPosition(null);
                  onSelect();
                }}
                className={cn(
                  'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
                  tone === 'danger'
                    ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
                    : 'text-fg hover:bg-surface-muted',
                )}
              >
                <Icon className={cn('size-4 shrink-0', tone === 'default' && 'text-fg-muted')} aria-hidden />
                {itemLabel}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
