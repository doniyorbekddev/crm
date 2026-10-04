import { useCallback, useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

interface AnchorOptions {
  /** Suzuvchi panelning taxminiy balandligi — pastga sig'masa tepaga ochiladi */
  estimatedHeight?: number;
  /** Kenglik: langar bilan teng yoki eng kamida shuncha */
  minWidth?: number;
  gap?: number;
}

const EDGE = 8;

/**
 * Suzuvchi panel (ro'yxat, menyu) ni langar element ostiga `position: fixed` bilan joylaydi.
 * Panel `document.body` ga chiziladi — jadval yoki modalning `overflow` i uni kesmaydi.
 * Aylantirish va o'lcham o'zgarishida langarga ergashadi.
 */
export function useAnchorPosition(anchorRef: RefObject<HTMLElement | null>, open: boolean, options: AnchorOptions = {}): CSSProperties | null {
  const { estimatedHeight = 280, minWidth = 0, gap = 4 } = options;
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const measure = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - EDGE * 2);
    const spaceBelow = window.innerHeight - rect.bottom - EDGE;
    const opensUp = spaceBelow < Math.min(estimatedHeight, 200) && rect.top > spaceBelow;
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE));
    setStyle(
      opensUp
        ? { position: 'fixed', left, width, bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(120, rect.top - EDGE - gap) }
        : { position: 'fixed', left, width, top: rect.bottom + gap, maxHeight: Math.max(120, spaceBelow - gap) },
    );
  }, [anchorRef, estimatedHeight, minWidth, gap]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    // Chizilishdan oldin o'lchanadi — panel bir kadr ham noto'g'ri joyda ko'rinmaydi
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, measure]);

  return open ? style : null;
}
