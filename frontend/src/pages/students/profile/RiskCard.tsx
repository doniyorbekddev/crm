import { useQuery } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { RiskFactor } from '@/types/student';
import { formatDateTime } from '@/utils/format';
import { RISK_LEVEL_LABELS, RISK_LEVEL_TONES } from '@/utils/studentLabels';

/** Signal balliga qarab rang: past ball — qizil chiziq */
function barTone(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-brand-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function FactorRow({ factor }: { factor: RiskFactor }) {
  const hasScore = factor.score !== null;
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm text-fg">{factor.label}</span>
          <span className={cn('shrink-0 text-sm tabular-nums', hasScore ? 'text-fg' : 'text-fg-subtle')}>{factor.value}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          {hasScore && <div className={cn('h-full rounded-full', barTone(factor.score!))} style={{ width: `${factor.score}%` }} />}
        </div>
        <p className="mt-1 text-xs text-fg-subtle">{hasScore ? factor.hint : `${factor.hint} — ma’lumot yo‘q`}</p>
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-muted">{hasScore ? factor.score : '—'}</span>
    </li>
  );
}

/**
 * O'quvchining ketib qolish xavfi. Holat (o'qimoqda / muzlatilgan) bilan aralashtirilmaydi —
 * bu alohida o'lchov: o'quvchi bir vaqtda "Faol" va "Kritik" bo'lishi mumkin.
 */
export function RiskCard({ studentId }: { studentId: string }) {
  const riskQuery = useQuery({
    queryKey: queryKeys.students.risk(studentId),
    queryFn: () => studentsService.risk(studentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ketib qolish xavfi</CardTitle>
        {riskQuery.data?.updatedAt && (
          <span className="text-xs text-fg-muted">{formatDateTime(riskQuery.data.updatedAt)} holatiga</span>
        )}
      </CardHeader>
      <CardContent>
        {riskQuery.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : riskQuery.isError ? (
          <ErrorState error={riskQuery.error} onRetry={() => void riskQuery.refetch()} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {riskQuery.data.riskLevel ? (
                <>
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full',
                      riskQuery.data.riskLevel === 'HEALTHY'
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400',
                    )}
                  >
                    {riskQuery.data.riskLevel === 'HEALTHY' ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone={RISK_LEVEL_TONES[riskQuery.data.riskLevel]}>{RISK_LEVEL_LABELS[riskQuery.data.riskLevel]}</Badge>
                      <span className="text-2xl font-semibold tabular-nums text-fg">{riskQuery.data.healthScore}</span>
                      <span className="text-sm text-fg-muted">/ 100</span>
                    </div>
                    {riskQuery.data.reasons.length > 0 && (
                      <p className="mt-1 text-sm text-fg-muted">{riskQuery.data.reasons.join(' · ')}</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg-muted">
                  Baho uchun yetarli ma’lumot yo‘q — davomat, uy vazifasi yoki to‘lov tarixi to‘planishi kerak.
                </p>
              )}
            </div>

            <ul className="mt-4 divide-y divide-border">
              {riskQuery.data.factors.map((factor) => (
                <FactorRow key={factor.key} factor={factor} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
