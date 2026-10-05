import { useQuery } from '@tanstack/react-query';
import { Wallet2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { teachersService } from '@/services/teachers.service';
import { formatDate, formatMoney } from '@/utils/format';
import {
  SALARY_STATUS_LABELS,
  SALARY_STATUS_TONES,
  SALARY_TYPE_LABELS,
  salaryRuleSummary,
} from '@/utils/teacherLabels';

/**
 * O‘qituvchining o‘z maoshi. Profili bo‘lmagan xodimda `/teachers/me` 404 qaytaradi —
 * bu holda kartochka umuman ko‘rsatilmaydi.
 */
export function MyTeachingCard() {
  const query = useQuery({
    queryKey: queryKeys.teachers.me,
    queryFn: teachersService.myTeaching,
    retry: false,
  });

  if (query.isError) return null;

  if (query.isPending) {
    return <Skeleton className="h-40 w-full rounded-card" />;
  }

  const { salaryRule, salaryPeriods, salaryTotals } = query.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mening maoshim</CardTitle>
        <span className="text-caption text-fg-muted">
          {salaryTotals.year}-yil: {formatMoney(salaryTotals.paid)} to‘langan
          {salaryTotals.remaining > 0 && ` · ${formatMoney(salaryTotals.remaining)} qolgan`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {salaryRule ? (
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-muted p-3">
            <Badge tone="blue">{SALARY_TYPE_LABELS[salaryRule.type]}</Badge>
            <span className="text-body text-fg">{salaryRuleSummary(salaryRule)}</span>
            <span className="text-caption text-fg-muted">{formatDate(salaryRule.effectiveFrom)} dan amalda</span>
          </div>
        ) : (
          <p className="text-body text-fg-muted">Maosh modeli hali belgilanmagan — buxgalteriyaga murojaat qiling.</p>
        )}

        {salaryPeriods.length === 0 ? (
          <EmptyState
            icon={Wallet2}
            title="Tasdiqlangan maosh yo‘q"
            description="Oy yakunlanib, maosh tasdiqlangandan keyin shu yerda ko‘rinadi"
          />
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border">
            {salaryPeriods.map((period) => (
              <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-body text-fg">{period.label}</p>
                  <p className="text-caption text-fg-muted">
                    {period.lessonsCount} dars · {period.studentsCount} o‘quvchi
                    {period.bonus > 0 && ` · bonus ${formatMoney(period.bonus)}`}
                    {period.penalty > 0 && ` · jarima ${formatMoney(period.penalty)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                  <div className="text-right">
                    <p className="text-label text-fg">{formatMoney(period.totalAmount)}</p>
                    {period.remainingAmount > 0 && (
                      <p className="text-caption text-warning">
                        qolgan {formatMoney(period.remainingAmount)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
