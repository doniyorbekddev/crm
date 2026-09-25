import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MonitorCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { AvailableExam } from '@/types/portal';
import { formatDateTime } from '@/utils/format';
import { EXAM_TYPE_LABELS } from '@/utils/homeworkLabels';

function windowLabel(exam: AvailableExam): string | null {
  if (exam.startAt && exam.endAt) return `${formatDateTime(exam.startAt)} — ${formatDateTime(exam.endAt)}`;
  if (exam.startAt) return `${formatDateTime(exam.startAt)} dan`;
  if (exam.endAt) return `${formatDateTime(exam.endAt)} gacha`;
  return null;
}

/** Kabinetdan topshiriladigan imtihonlar. Ota-ona ko'radi, lekin boshlay olmaydi */
export function OnlineExamsCard() {
  const { me, activeChild } = usePortal();
  const isStudent = me.kind === 'STUDENT';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.portal.availableExams(activeChild), queryFn: () => portalService.availableExams(activeChild) });

  const start = useMutation({
    mutationFn: (examId: string) => portalService.startExam(examId),
    onSuccess: (view) => {
      queryClient.setQueryData(queryKeys.portal.attempt(view.attemptId), view);
      navigate(`/portal/attempts/${view.attemptId}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      void query.refetch();
    },
  });

  if (query.isSuccess && query.data.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Onlayn imtihonlar</CardTitle>
        <CardDescription>{isStudent ? 'Kabinetdan o‘zingiz topshirasiz — javoblar avtomatik saqlanadi' : 'Farzandingiz kabinetidan topshiradi'}</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((exam) => {
              const period = windowLabel(exam);
              return (
                <li key={exam.examId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-fg">
                      <MonitorCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
                      <span className="truncate">{exam.title}</span>
                    </p>
                    <p className="text-xs text-fg-muted">
                      {EXAM_TYPE_LABELS[exam.type]} · {exam.questionCount} savol
                      {exam.durationMinutes ? ` · ${exam.durationMinutes} daqiqa` : ''}
                      {exam.maxAttempts > 0 ? ` · urinish ${exam.attemptsUsed}/${exam.maxAttempts}` : ''}
                    </p>
                    {period && <p className="text-xs text-fg-subtle">{period}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {exam.lastResult && (
                      <Badge tone={exam.lastResult.status === 'NEEDS_REVIEW' ? 'yellow' : 'gray'}>
                        {exam.lastResult.status === 'NEEDS_REVIEW' ? 'Tekshirilmoqda' : `Oxirgi: ${exam.lastResult.percentage}%`}
                      </Badge>
                    )}
                    {!exam.canStart ? (
                      <span className="text-xs text-fg-muted">{exam.reason}</span>
                    ) : !isStudent ? (
                      exam.openAttemptId ? <Badge tone="blue">Topshirilmoqda</Badge> : <Badge tone="green">Ochiq</Badge>
                    ) : exam.openAttemptId ? (
                      <Button onClick={() => navigate(`/portal/attempts/${exam.openAttemptId}`)}>
                        Davom ettirish
                      </Button>
                    ) : (
                      <Button loading={start.isPending && start.variables === exam.examId} onClick={() => start.mutate(exam.examId)}>
                        {exam.attemptsUsed > 0 ? 'Qayta topshirish' : 'Boshlash'}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
