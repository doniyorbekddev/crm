import { useEffect, useSyncExternalStore } from 'react';
import { useThemeStore } from '@/store/theme.store';

export type ResolvedTheme = 'light' | 'dark';

const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function subscribeToSystemTheme(onChange: () => void): () => void {
  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  mediaQuery.addEventListener('change', onChange);
  return () => mediaQuery.removeEventListener('change', onChange);
}

function getSystemPrefersDark(): boolean {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/** Tanlangan mavzuni (system bo‘lsa — operatsion tizim sozlamasini) hisobga olib, haqiqiy mavzuni qaytaradi. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useThemeStore((state) => state.theme);
  const systemPrefersDark = useSyncExternalStore(subscribeToSystemTheme, getSystemPrefersDark, () => false);

  if (theme === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return theme;
}

/** Mavzuni <html> elementiga qo‘llaydi. Ilova ildizida bir marta chaqiriladi. */
export function useApplyTheme(): ResolvedTheme {
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return resolvedTheme;
}
