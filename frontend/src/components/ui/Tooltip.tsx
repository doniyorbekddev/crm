import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: ReactNode;
  /** Bitta interaktiv element (tugma, havola) */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: Side;
  /** Ochilish kechikishi (ms) — sichqoncha o'tib ketganda miltillamasligi uchun */
  delay?: number;
  disabled?: boolean;
  /**
   * `false` — maslahat elementning nomini takrorlaydi (masalan `IconButton` da `aria-label` bilan bir xil):
   * ekran o'quvchiga ikki marta o'qilmasin.
   */
  describe?: boolean;
  className?: string;
}

const GAP = 6;
const EDGE = 8;

/**
 * Maslahat (tooltip): sichqoncha ustiga kelganda **va klaviatura fokusida** ochiladi, Esc bilan yopiladi.
 * `title="..."` o'rniga — u klaviaturada va sensorli ekranda ko'rinmaydi.
 */
export function Tooltip({ content, children, side = 'top', delay = 300, disabled = false, describe = true, className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden', top: 0, left: 0 });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = (wait: number) => {
    if (disabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), wait);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = wrapperRef.current?.getBoundingClientRect();
    const tip = tipRef.current?.getBoundingClientRect();
    if (!anchor || !tip) return;
    // Sig'masa qarama-qarshi tomonga o'tadi
    let actual: Side = side;
    if (side === 'top' && anchor.top - tip.height - GAP < EDGE) actual = 'bottom';
    else if (side === 'bottom' && anchor.bottom + tip.height + GAP > window.innerHeight - EDGE) actual = 'top';
    else if (side === 'left' && anchor.left - tip.width - GAP < EDGE) actual = 'right';
    else if (side === 'right' && anchor.right + tip.width + GAP > window.innerWidth - EDGE) actual = 'left';

    let top = actual === 'top' ? anchor.top - tip.height - GAP : actual === 'bottom' ? anchor.bottom + GAP : anchor.top + (anchor.height - tip.height) / 2;
    let left = actual === 'left' ? anchor.left - tip.width - GAP : actual === 'right' ? anchor.right + GAP : anchor.left + (anchor.width - tip.width) / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - tip.width - EDGE));
    top = Math.max(EDGE, Math.min(top, window.innerHeight - tip.height - EDGE));
    setStyle({ top, left });
  }, [open, side, content]);

  const describedBy = open && describe ? id : undefined;

  return (
    <span
      ref={wrapperRef}
      className="inline-flex"
      onMouseEnter={() => show(delay)}
      onMouseLeave={hide}
      onFocus={() => show(0)}
      onBlur={hide}
    >
      {describedBy ? cloneElement(children, { 'aria-describedby': describedBy }) : children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            aria-hidden={describe ? undefined : true}
            style={style}
            className={cn(
              'pointer-events-none fixed z-tooltip max-w-xs animate-fade-in rounded-chip bg-fg px-2 py-1 text-caption font-medium text-surface shadow-md',
              className,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
