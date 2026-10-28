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
  /**
   * `stage` — brend lahzasi (faqat dashboard): doim to'q sirt, aurora nuri, spotlight va jonli nuqta.
   * Ma'lumot zich sahifalarda ishlatilmaydi.
   */
  variant?: 'default' | 'stage';
  /** `stage` sarlavhasi ustidagi kichik yozuv (jonli nuqta bilan) */
  eyebrow?: string;
}

export function PageHeader({ title, description, actions, documentTitle, breadcrumb, variant = 'default', eyebrow }: PageHeaderProps) {
  useDocumentTitle(documentTitle ?? title);

  if (variant === 'stage') {
    return (
      <div data-spotlight className="relative isolate mb-6 overflow-hidden rounded-card border border-stage-line bg-stage p-6 text-stage-fg shadow-stage-highlight sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <span className="aurora-orb -top-24 -right-12 size-80 animate-aurora-1 bg-(--app-stage-aurora-1)" />
          <span className="aurora-orb -bottom-28 left-1/4 size-72 animate-aurora-3 bg-(--app-stage-aurora-3)" />
          <div className="stage-grid absolute inset-0" />
        </div>
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-2 inline-flex items-center gap-2 text-caption font-medium text-stage-muted">
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inset-0 animate-live-dot rounded-full bg-stage-accent" />
                  <span className="relative size-2 rounded-full bg-stage-accent" />
                </span>
                {eyebrow}
              </p>
            )}
            <h1 className="text-h2 text-gradient-stage sm:text-h1">{title}</h1>
            {description && <p className="mt-1 text-body text-stage-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </div>
    );
  }

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
