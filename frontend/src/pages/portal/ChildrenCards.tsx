import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { RiskLevel } from '@/types/student';
import { formatDate, formatMoney } from '@/utils/format';

/** Ota-onaga yumshoq so‘z bilan — "kritik" emas */
const RISK_TEXT: Record<RiskLevel, { label: string; className: string }> = {
  HEALTHY: { label: 'Hammasi yaxshi', className: 'text-emerald-600 dark:text-emerald-400' },
  ATTENTION: { label: 'E’tibor kerak', className: 'text-amber-600 dark:text-amber-400' },
  AT_RISK: { label: 'Yordam kerak', className: 'text-orange-600 dark:text-orange-400' },
  CRITICAL: { label: 'Yordam kerak', className: 'text-red-600 dark:text-red-400' },
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className="text-base font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

/**
 * "Farzandlarim" (TZ §10): har farzand bo‘yicha qisqa ko‘rsatkichlar. Karta bosilsa o‘sha farzand
 * tanlanadi — barcha bo‘limlar (vazifa, davomat, to‘lov…) unga o‘tadi.
 */
export function ChildrenCards() {
  const { activeChild, setActiveChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.children, queryFn: () => portalService.children() });

  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <section aria-labelledby="children-title">
      <h2 id="children-title" className="mb-3 text-base font-semibold text-fg">
        Farzandlarim
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {query.data.map((child) => {
          const active = child.studentId === activeChild;
          const risk = child.risk ? RISK_TEXT[child.risk] : null;
          return (
            <Card key={child.studentId} className={cn(active && 'ring-2 ring-brand-500')}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle className="truncate">{child.fullName}</CardTitle>
                  <p className="truncate text-xs text-fg-muted">
                    {child.code} · {child.courseName}
                    {child.groupName ? ` · ${child.groupName}` : ''}
                  </p>
                </div>
                {active ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-300">
                    <Check className="size-3.5" aria-hidden />
                    Tanlangan
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveChild(child.studentId)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:text-brand-300"
                  >
                    Tanlash
                  </button>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <Metric label="Davomat" value={`${child.attendanceRate}%`} />
                  <Metric label="Vazifa" value={`${child.homeworkRate}%`} />
                  <Metric label="Imtihon" value={child.examAverage === null ? '—' : `${child.examAverage}%`} />
                  <Metric label="Daraja" value={`${child.level}`} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1 text-fg-muted">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {child.nextLesson ? `Keyingi dars: ${formatDate(child.nextLesson.date)}, ${child.nextLesson.startTime}` : 'Yaqin darslar yo‘q'}
                  </span>
                  {risk && <span className={cn('font-medium', risk.className)}>{risk.label}</span>}
                </div>
                <p className={cn('text-xs', child.debt.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-muted')}>
                  {child.debt.remaining > 0
                    ? `Qolgan to‘lov: ${formatMoney(child.debt.remaining)}${child.debt.overdue > 0 ? ` · muddati o‘tgan: ${formatMoney(child.debt.overdue)}` : ''}`
                    : 'Qarz yo‘q'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
