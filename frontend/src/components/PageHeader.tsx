import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Brauzer tabidagi nom (bo‘sh bo‘lsa — `title` ishlatiladi) */
  documentTitle?: string;
  /** Sarlavha ustidagi yo'l (odatda `<Breadcrumb />`) */
  breadcrumb?: ReactNode;
}

export function PageHeader({ title, description, actions, documentTitle, breadcrumb }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? title);

  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 text-fg sm:text-h1">{title}</h1>
          {description && <p className="mt-1 text-body text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
