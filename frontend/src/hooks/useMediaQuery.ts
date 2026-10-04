import { useSyncExternalStore } from 'react';

/** CSS media so'rovi natijasi (masalan `(min-width: 640px)`). `matchMedia` yo'q muhitda — `fallback`. */
export function useMediaQuery(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

/** Tailwind `sm` (640px) va undan keng ekran */
export const DESKTOP_QUERY = '(min-width: 640px)';
