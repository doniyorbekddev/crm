import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { isTopDialog, useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Qaytarib bo‘lmaydigan amallardan oldin tasdiqlash oynasi. Esc yoki fonni bosish — bekor qilish. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Tasdiqlash',
  cancelLabel = 'Bekor qilish',
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading && isTopDialog(dialogRef.current)) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-overlay" aria-hidden onClick={() => !loading && onCancel()} />
      <div
        ref={dialogRef}
        role="alertdialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md animate-pop-in rounded-dialog border border-border bg-surface-elevated p-6 shadow-md outline-none"
      >
        <div className="flex gap-4">
          <div
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full',
              tone === 'danger'
                ? 'bg-danger-subtle text-danger'
                : 'bg-primary-subtle text-primary',
            )}
          >
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-h3 text-fg">
              {title}
            </h2>
            <div id={descriptionId} className="mt-1.5 text-body text-fg-muted">
              {description}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
