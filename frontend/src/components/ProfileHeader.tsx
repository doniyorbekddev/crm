import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { cn } from '@/lib/cn';

export interface ProfileMetaItem {
  icon: LucideIcon;
  label: ReactNode;
  /** Ekran o'quvchi uchun: ikonka nimani anglatadi ("Telefon", "Guruh") */
  name: string;
}

interface ProfileHeaderProps {
  /** Ro'yxatga qaytish havolasi */
  back: { to: string; label: string };
  /** Odam uchun: bosh harflar. Odam bo'lmagan obyekt (guruh, kurs) uchun `icon` bering. */
  firstName?: string;
  lastName?: string | null;
  icon?: LucideIcon;
  /** Sahifa sarlavhasi (`h1`) — odatda to'liq ism */
  title: string;
  /** Sarlavha yonidagi holat belgilari */
  badges?: ReactNode;
  meta?: ProfileMetaItem[];
  /** Asosiy amallar (o'ngda; telefonda sarlavha ostida) */
  actions?: ReactNode;
  /** Pastki qatordagi asosiy ko'rsatkichlar — `ProfileStat` lar */
  stats?: ReactNode;
  documentTitle?: string;
}

/**
 * Tafsilot sahifasi sarlavhasi (o'quvchi, o'qituvchi …): kim, qanday holatda, eng kerakli amallar.
 * "Qayerdaman / bu kim / nima qila olaman" — bir qarashda.
 */
export function ProfileHeader({ back, firstName, lastName, icon: Icon, title, badges, meta, actions, stats, documentTitle }: ProfileHeaderProps) {
  useDocumentTitle(documentTitle ?? title);
  return (
    <div className="mb-5">
      <Link to={back.to} className="focus-ring mb-3 inline-flex items-center gap-1.5 rounded-sm text-body text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        {back.label}
      </Link>
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            {Icon ? (
              <span className="grid size-14 shrink-0 place-items-center rounded-card bg-primary-subtle text-primary ring-1 ring-primary-border ring-inset sm:size-16">
                <Icon className="size-6 sm:size-7" aria-hidden />
              </span>
            ) : (
              <Avatar firstName={firstName ?? title} lastName={lastName} size="lg" className="size-14 text-h3 sm:size-16 sm:text-h2" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h1 className="text-h2 text-fg sm:text-h1">{title}</h1>
                {badges}
              </div>
              {meta && meta.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-body text-fg-muted">
                  {meta.map(({ icon: Icon, label, name }) => (
                    <li key={name} className="inline-flex items-center gap-1.5">
                      <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                      <span className="sr-only">{name}:</span>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {stats && <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">{stats}</dl>}
      </Card>
    </div>
  );
}

/** Sarlavha ostidagi bitta ko'rsatkich. `tone` — qiymat ma'nosi (davomat past bo'lsa `warning`). */
export function ProfileStat({
  label,
  value,
  hint,
  tone = 'default',
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  /** Qiymat ostidagi qo'shimcha (masalan daraja chizig'i) */
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-fg-muted">{label}</dt>
      <dd className="mt-0.5">
        <span
          className={cn(
            'text-h3 tabular-nums',
            tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-fg',
          )}
        >
          {value}
        </span>
        {hint && <span className="ml-1.5 text-caption text-fg-muted">{hint}</span>}
        {children}
      </dd>
    </div>
  );
}
