import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { LeadTemperatureBadge } from '@/components/leads/LeadStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import { LEAD_TEMPERATURE_HINTS } from '@/utils/leadLabels';

/**
 * Lead bahosi va u qanday yig'ilgani. Ball o'zi yetarli emas — xodim "nega 72?"
 * degan savolga javob ko'rishi kerak, shuning uchun har bir omil o'z sababi bilan
 * ko'rsatiladi. Manfiy omillar (masalan uzoq vaqt aloqa yo'qligi) qizil rangda.
 */
export function LeadScoreCard({ leadId }: { leadId: string }) {
  const scoreQuery = useQuery({
    queryKey: queryKeys.leads.score(leadId),
    queryFn: () => leadsService.score(leadId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="size-4 text-fg-subtle" aria-hidden />
          Qiziqish bahosi
        </CardTitle>
      </CardHeader>
      <CardContent>
        {scoreQuery.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : scoreQuery.isError ? (
          <ErrorState error={scoreQuery.error} onRetry={() => void scoreQuery.refetch()} />
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums text-fg">{scoreQuery.data.score}</span>
              <span className="text-sm text-fg-subtle">/ 100</span>
              <span className="ml-auto">
                <LeadTemperatureBadge temperature={scoreQuery.data.temperature} />
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="presentation">
              <div
                className={cn(
                  'h-full rounded-full transition-[width]',
                  scoreQuery.data.score >= 70 ? 'bg-emerald-500' : scoreQuery.data.score >= 40 ? 'bg-amber-500' : 'bg-slate-400',
                )}
                style={{ width: `${scoreQuery.data.score}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-fg-subtle">{LEAD_TEMPERATURE_HINTS[scoreQuery.data.temperature]}</p>

            <ul className="mt-4 divide-y divide-border">
              {scoreQuery.data.factors.map((factor) => (
                <li key={factor.key} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="text-fg">{factor.label}</p>
                    <p className="text-xs text-fg-subtle">{factor.detail}</p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 font-medium tabular-nums',
                      factor.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : factor.points < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg-subtle',
                    )}
                  >
                    {factor.points > 0 ? `+${factor.points}` : factor.points}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
