import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appEnv } from '@/lib/env';
import { queryKeys } from '@/lib/queryKeys';
import { academySettingsService, brandingAssetUrl } from '@/services/academySettings.service';
import type { Branding } from '@/types/settings';
import { setBaseTitle } from './useDocumentTitle';

export interface ResolvedBranding extends Omit<Branding, 'logoUrl'> {
  /** To'liq URL yoki null */
  logoUrl: string | null;
}

/** Markaz nomi va logosi (TZ 3.1 GAP-01). Yuklanguncha yoki xato bo'lsa — build nomi (VITE_APP_NAME) */
export function useBranding(): ResolvedBranding {
  const query = useQuery({
    queryKey: queryKeys.settings.branding,
    queryFn: () => academySettingsService.branding(),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const data = query.data;
  return {
    name: data?.name ?? appEnv.appName,
    logoUrl: brandingAssetUrl(data?.logoUrl ?? null),
    currency: data?.currency ?? 'UZS',
    defaultLanguage: data?.defaultLanguage ?? 'uz',
  };
}

/** Ilova darajasida bir marta: brauzer sarlavhasi va `<html lang>` markaz sozlamasidan */
export function useBrandingSync(): void {
  const { name, defaultLanguage } = useBranding();
  useEffect(() => {
    setBaseTitle(name);
  }, [name]);
  useEffect(() => {
    document.documentElement.lang = defaultLanguage;
  }, [defaultLanguage]);
}
