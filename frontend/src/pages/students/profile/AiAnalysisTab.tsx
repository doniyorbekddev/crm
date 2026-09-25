import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import { toast } from 'sonner';
import { AiSourceBadge, InsightList } from '@/components/ai/InsightList';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { aiAcademicService } from '@/services/aiAcademic.service';
import { formatDateTime } from '@/utils/format';
import { RISK_LEVEL_LABELS, RISK_LEVEL_TONES } from '@/utils/studentLabels';

const SCORE_LABELS = { academic: 'Akademik', attendance: 'Davomat', engagement: 'Faollik', homework: 'Vazifa', assessment: 'Baholash' } as const;

/**
 * AI o'quvchi tahlili (TZ §32–33): 5 ball, deterministik risk (o'zgarmaydi), sabablar raqamlar
 * bilan — fakt / kuzatuv / tavsiya alohida.
 */
export function AiAnalysisTab({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const key = queryKeys.aiAcademic.student(studentId);
  const query = useQuery({ queryKey: key, queryFn: () => aiAcademicService.latestStudent(studentId) });
  const run = useMutation({
    mutationFn: () => aiAcademicService.analyzeStudent(studentId),
    onSuccess: (analysis) => queryClient.setQueryData(key, analysis),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const analysis = query.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>AI tahlil</CardTitle>
            <CardDescription>
              {analysis ? `${formatDateTime(analysis.createdAt)} · ${analysis.createdBy ? `${analysis.createdBy.firstName} ${analysis.createdBy.lastName}` : 'tizim'}` : 'CRM ma’lumotlari asosida — yakuniy xulosa o‘qituvchida'}
            </CardDescription>
          </div>
          <Button leftIcon={<Bot className="size-4" aria-hidden />} loading={run.isPending} onClick={() => run.mutate()}>
            {analysis ? 'Yangilash' : 'Tahlil qilish'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!analysis ? (
          <EmptyState icon={Bot} title="Hali tahlil qilinmagan" description="“Tahlil qilish” davomat, vazifa, imtihon va mavzular bo‘yicha xulosa tayyorlaydi" />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <AiSourceBadge source={analysis.source} model={analysis.model} />
              {analysis.result.riskLevel && (
                <Badge tone={RISK_LEVEL_TONES[analysis.result.riskLevel]}>
                  Risk: {RISK_LEVEL_LABELS[analysis.result.riskLevel]}
                  {analysis.result.healthScore !== null && ` · ${analysis.result.healthScore}/100`}
                </Badge>
              )}
            </div>
            <p className="text-sm text-fg">{analysis.summary}</p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(Object.keys(SCORE_LABELS) as Array<keyof typeof SCORE_LABELS>).map((scoreKey) => {
                const value = analysis.result.scores[scoreKey];
                return (
                  <div key={scoreKey} className="rounded-lg border border-border p-2">
                    <dt className="text-xs text-fg-muted">{SCORE_LABELS[scoreKey]}</dt>
                    <dd className={cn('text-lg font-semibold tabular-nums', value === null ? 'text-fg-subtle' : value >= 80 ? 'text-emerald-600 dark:text-emerald-400' : value >= 60 ? 'text-fg' : 'text-red-600 dark:text-red-400')}>
                      {value === null ? '—' : value}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <InsightList items={analysis.result.items} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
