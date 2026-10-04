import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isTopDialog, useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

interface DrawerProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left';
  size?: keyof typeof SIZES;
  /** Telefonda: `sheet` — pastdan chiquvchi panel (standart), `side` — yon tomondan to'liq balandlikda */
  mobile?: 'sheet' | 'side';
  /** Saqlash jarayonida yopishni bloklash */
  closeDisabled?: boolean;
  /** Sarlavha qatoridagi qo'shimcha amallar (yopish tugmasidan oldin) */
  headerActions?: ReactNode;
}

/**
 * Yon panel: tezkor ko'rish va qisqa tahrir uchun — sahifa konteksti orqada qoladi.
 * Modal bilan bir xil qoidalar: fokus tutqichi, Esc, fon bosilganda yopilish, fokus ochgan elementga qaytadi.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  side = 'right',
  size = 'md',
  mobile = 'sheet',
  closeDisabled = false,
  headerActions,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled && isTopDialog(dialogRef.current)) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  const sheet = mobile === 'sheet';

  return createPortal(
    <div className={cn('fixed inset-0 z-drawer flex', sheet ? 'items-end sm:items-stretch' : 'items-stretch', side === 'right' ? 'justify-end' : 'justify-start')}>
      <div className="absolute inset-0 animate-fade-in bg-overlay" aria-hidden onClick={() => !closeDisabled && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'relative flex w-full flex-col border-border bg-surface-elevated shadow-md outline-none',
          SIZES[size],
          sheet
            ? 'max-h-[92vh] animate-slide-in-up rounded-t-dialog border sm:h-full sm:max-h-none sm:rounded-none sm:border-y-0'
            : 'h-full',
          side === 'right'
            ? cn('sm:border-r-0 sm:border-l', sheet ? 'sm:animate-slide-in-right' : 'animate-slide-in-right border-l')
            : cn('sm:border-r sm:border-l-0', sheet ? 'sm:animate-slide-in-left' : 'animate-slide-in-left border-r'),
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h3 text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-body text-fg-muted">
                {description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Yopish"
              className="focus-ring grid size-8 place-items-center rounded-chip text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
