import { useEffect } from 'react';
import { appEnv } from '@/lib/env';

/** Markaz nomi (sozlamadan, `useBrandingSync` yangilaydi); yuklanguncha — build nomi */
let baseTitle = appEnv.appName;
let pageTitle = '';

function apply(): void {
  document.title = pageTitle ? `${pageTitle} · ${baseTitle}` : baseTitle;
}

export function setBaseTitle(name: string): void {
  if (!name || name === baseTitle) return;
  baseTitle = name;
  apply();
}

/** Brauzer tabidagi sarlavhani sahifa nomiga moslaydi: "Leadlar · IT-Academy" */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    pageTitle = title;
    apply();
    return () => {
      pageTitle = '';
      apply();
    };
  }, [title]);
}
