import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { TopicBreakdown } from '@/types/question';
import { formatDate, formatDateTime } from '@/utils/format';
import { EXAM_STATUS_LABELS, EXAM_STATUS_TONES, GRADE_TONES } from '@/utils/homeworkLabels';

function topicTone(percent: number): string {
  if (percent >= 85) return 'bg-emerald-500';
  if (percent >= 60) return 'bg-brand-500';
  return 'bg-red-500';
}

function TopicBars({ topics }: { topics: TopicBreakdown[] }) {
  if (topics.length === 0) return null;
  return (
    <ul className="space-y-2">
      {topics.map((topic) => (
        <li key={topic.topicId ?? topic.topicTitle}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-fg">{topic.topicTitle}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">
              {topic.score}/{topic.maxScore} · {topic.percent}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className={cn('h-full rounded-full', topicTone(topic.percent))} style={{ width: `${topic.percent}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Imtihon detali: natija, urinishlar, mavzu kesimi (kuchli/zaif), javoblar va o‘qituvchi izohlari */
export default function PortalExamDetailPage() {
  const { id = '' } = useParams();
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.examDetail(activeChild, id), queryFn: () => portalService.examDetail(id, activeChild) });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { exam, result, attempts } = query.data;
  const latest = attempts[0] ?? null;

  return (
    <div>
      <Link to="/portal/exams" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Barcha imtihonlar
      </Link>
      <PageHeader
        title={exam.title}
        description={`${exam.groupName} · ${formatDate(exam.date)} · maksimal ${exam.maxScore} ball${exam.passScore ? ` · o‘tish ${exam.passScore}` : ''}`}
        actions={<Badge tone={EXAM_STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>}
      />

      {exam.description && <p className="mb-4 text-sm text-fg-muted">{exam.description}</p>}

      {!result && !latest ? (
        <Card>
          <EmptyState icon={FileCheck} title="Natija hali yo‘q" description="Imtihon o‘tkazilib baholangach shu yerda ko‘rinadi" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Natija</CardTitle>
                {result?.comment && <CardDescription>Izoh: {result.comment}</CardDescription>}
              </div>
              {result && (
                <span className="flex items-center gap-2">
                  {result.grade && <Badge tone={GRADE_TONES[result.grade] ?? 'gray'}>{result.grade}</Badge>}
                  {result.passed !== null && (
                    <span className={cn('text-xs font-medium', result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {result.passed ? 'O‘tdi' : 'O‘tmadi'}
                    </span>
                  )}
                </span>
              )}
            </CardHeader>
            <CardContent>
              {result ? (
                <p className="text-3xl font-semibold tabular-nums text-fg">
                  {result.percentage}%
                  <span className="ml-2 text-base font-normal text-fg-muted">
                    {result.score}/{result.maxScore}
                    {result.xpAwarded > 0 && ` · +${result.xpAwarded} XP`}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-fg-muted">Urinish tekshirilmoqda.</p>
              )}
              {latest && latest.topics.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium text-fg">Mavzular bo‘yicha</p>
                  <TopicBars topics={latest.topics} />
                  {latest.weakTopics.length > 0 && (
                    <p className="mt-2 text-xs text-fg-muted">Takrorlash tavsiya etiladi: {latest.weakTopics.join(', ')}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {latest && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Javoblarim</CardTitle>
                  <CardDescription>
                    {latest.attemptNo}-urinish · {latest.submittedAt ? formatDateTime(latest.submittedAt) : 'yakunlanmagan'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ol className="divide-y divide-border">
                  {latest.answers.map((answer, index) => (
                    <li key={answer.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-fg">
                          <span className="mr-1 text-fg-muted">{index + 1}.</span>
                          {answer.questionText}
                        </p>
                        <span
                          className={cn(
                            'shrink-0 text-sm tabular-nums',
                            answer.isCorrect === null ? 'text-fg-muted' : answer.isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {answer.needsReview ? 'tekshirilmoqda' : `${answer.score}/${answer.points}`}
                        </span>
                      </div>
                      {answer.text && <p className="mt-1 text-xs whitespace-pre-wrap text-fg-muted">Javob: {answer.text}</p>}
                      {answer.feedback && <p className="mt-1 text-xs text-fg-muted">Izoh: {answer.feedback}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
