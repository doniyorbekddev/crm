import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Brauzer tabidagi nom (bo‘sh bo‘lsa — `title` ishlatiladi) */
  documentTitle?: string;
}

export function PageHeader({ title, description, actions, documentTitle }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? title);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
