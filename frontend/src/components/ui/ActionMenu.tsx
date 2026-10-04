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

  /** Tugma joylashuviga qarab menyu o‘rni (pastga sig‘masa — tepaga ochiladi) */
  const positionFor = (rect: DOMRect) => {
    const menuHeight = items.length * ITEM_HEIGHT + 8;
    const opensUp = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight;
    return {
      top: opensUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    };
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    // Jadval yoki sahifa aylantirilsa menyu tugmaga ergashadi; tugma ekrandan chiqsa — yopiladi
    const follow = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        close();
        return;
      }
      setPosition(positionFor(rect));
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Faqat menyu yopiladi — ostidagi Modal/Drawer ochiq qoladi (shu sabab tinglovchi "capture" bosqichida)
        event.stopPropagation();
        close();
        buttonRef.current?.focus();
        return;
      }
      if (event.key === 'Tab') {
        close();
        return;
      }
      // ↑/↓, Home/End — menyu bandlari orasida (WAI-ARIA menu)
      const entries = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
      if (entries.length === 0) return;
      const current = entries.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === 'ArrowDown'
          ? (current + 1) % entries.length
          : event.key === 'ArrowUp'
            ? (current - 1 + entries.length) % entries.length
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? entries.length - 1
                : -1;
      if (next === -1) return;
      event.preventDefault();
      entries[next]!.focus();
    };
    // Ochilganda fokus birinchi bandga — klaviatura bilan darhol tanlash mumkin
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
    };
    // positionFor faqat items.length ga bog'liq — menyu ochiq turganda o'zgarmaydi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (items.length === 0) return null;

  const toggle = () => {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(positionFor(rect));
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
          'focus-ring transition-colors disabled:pointer-events-none disabled:opacity-60',
          trigger
            ? 'inline-flex h-10 shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-3.5 text-body font-medium text-fg shadow-sm hover:bg-surface-muted'
            : 'grid size-8 place-items-center rounded-chip text-fg-muted hover:bg-surface-muted hover:text-fg',
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
            className="fixed z-dropdown animate-fade-in overflow-hidden rounded-control border border-border bg-surface-elevated py-1 shadow-md"
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
                  'flex h-10 w-full items-center gap-2.5 px-3 text-left text-body outline-none transition-colors disabled:pointer-events-none disabled:opacity-50',
                  tone === 'danger'
                    ? 'text-danger hover:bg-danger-subtle focus-visible:bg-danger-subtle'
                    : 'text-fg hover:bg-surface-muted focus-visible:bg-surface-muted',
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
