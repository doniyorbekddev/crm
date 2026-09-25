import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isTopDialog, useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-5xl',
} as const;

interface ModalProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  /** Saqlash jarayonida yopishni bloklash */
  closeDisabled?: boolean;
}

/** Mobil’da pastdan chiquvchi panel (bottom sheet), desktop’da markazdagi oyna. */
export function Modal({ open, title, description, onClose, children, footer, size = 'md', closeDisabled = false }: ModalProps) {
  const titleId = useId();
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-950/50" aria-hidden onClick={() => !closeDisabled && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[92vh] w-full flex-col outline-none rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-xl',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Yopish"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
