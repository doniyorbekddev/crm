import { useEffect } from 'react';

const BASE_TITLE = 'Sales CRM';

/** Brauzer tabidagi sarlavhani sahifa nomiga moslaydi: "Leadlar · Sales CRM" */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
