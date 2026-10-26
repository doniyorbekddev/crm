import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface ActiveIndicatorOptions {
  /** Faol elementni topish: masalan `a[aria-current="page"]` yoki `[role="tab"][aria-selected="true"]` */
  selector: string;
  /**
   * `box` — indikator faol element o'rni va o'lchamini to'liq egallaydi (sidebar pill);
   * `underline` — faqat gorizontal o'rin va kenglik (balandlik/joy CSS'da, masalan pastki 2px chiziq)
   */
  mode?: 'box' | 'underline';
}

/**
 * Bitta sirpanuvchi indikator: faol element o'lchanadi (konteynerga nisbatan, aylantirish hisobga olinadi), indikator
 * `transform: translate(...)` bilan siljiydi — o'lcham o'tishsiz qo'yiladi (layout animatsiya qilinmaydi).
 * Birinchi joylashuv sakrab tushadi; keyingilari CSS o'tishi bilan. Konteyner va ro'yxatlar `ResizeObserver` bilan kuzatiladi.
 * Joylashgach konteynerga `data-indicator="ready"` qo'yiladi — undan oldin (yoki JS bo'lmasa) faol element o'z foni/chizig'i bilan.
 */
export function useActiveIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  { selector, mode = 'box' }: ActiveIndicatorOptions,
  deps: readonly unknown[],
): void {
  const placed = useRef(false);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return undefined;
    let frame = 0;
    const place = () => {
      const active = container.querySelector<HTMLElement>(selector);
      if (!active || active.offsetWidth === 0) {
        indicator.style.opacity = '0';
        delete container.dataset.indicator;
        return;
      }
      const box = container.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      const left = rect.left - box.left + container.scrollLeft;
      const top = rect.top - box.top + container.scrollTop;
      if (!placed.current) {
        indicator.style.transition = 'none';
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          indicator.style.transition = '';
        });
      }
      indicator.style.width = `${rect.width}px`;
      if (mode === 'box') {
        indicator.style.height = `${rect.height}px`;
        indicator.style.transform = `translate(${left}px, ${top}px)`;
      } else {
        indicator.style.transform = `translateX(${left}px)`;
      }
      indicator.style.opacity = '1';
      container.dataset.indicator = 'ready';
      placed.current = true;
    };
    place();
    // ResizeObserver bo'lmagan muhitda (eski brauzer, test) — oyna o'lchami bo'yicha
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', place);
      return () => {
        window.removeEventListener('resize', place);
        cancelAnimationFrame(frame);
      };
    }
    const observer = new ResizeObserver(place);
    observer.observe(container);
    for (const child of container.querySelectorAll('ul, [role="tablist"]')) observer.observe(child);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat chaqiruvchi bergan holatlar o'zgarganda qayta o'lchanadi
  }, deps);
}
