import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { questionsService } from '@/services/questions.service';
import type { Exam } from '@/types/homework';

/**
 * Imtihonga savollarni biriktirish va urinish natijalarini ko'rish.
 * Natijalar mavzular kesimida ko'rsatiladi — qaysi mavzu zaif ekani darrov ko'rinadi.
 */
export function ExamQuestionsModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [count, setCount] = useState('10');
  const [formError, setFormError] = useState<string | null>(null);

  const attemptsQuery = useQuery({
    queryKey: queryKeys.questions.attempts(exam.id),
    queryFn: () => questionsService.attempts(exam.id),
  });

  const attachRandom = useMutation({
    mutationFn: () => questionsService.attachToExam(exam.id, { random: { count: Number(count) } }),
    onSuccess: (result) => {
      toast.success(result.message);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  return (
    <Modal
      open
      size="lg"
      title="Imtihon savollari va natijalar"
      description={exam.title}
      onClose={onClose}
      footer={<Button onClick={onClose}>Yopish</Button>}
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3 sm:flex-row sm:items-end">
        <FormField label="Tasodifiy savollar" htmlFor="exam-random-count" hint="Savollar bazasidan shu kurs bo‘yicha tanlanadi">
          <Input
            id="exam-random-count"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </FormField>
        <Button
          leftIcon={<Shuffle className="size-4" aria-hidden />}
          loading={attachRandom.isPending}
          onClick={() => attachRandom.mutate()}
        >
          Biriktirish
        </Button>
      </div>

      {attemptsQuery.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (attemptsQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Hali urinish yo‘q"
          description="O‘quvchilar javoblari kiritilgach, natija va mavzular tahlili shu yerda ko‘rinadi."
        />
      ) : (
        <ul className="space-y-3">
          {attemptsQuery.data?.map((attempt) => (
            <li key={attempt.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-fg">{attempt.studentName}</p>
                  <p className="text-xs text-fg-subtle">
                    {attempt.attemptNo}-urinish · {attempt.score}/{attempt.maxScore} ball
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold tabular-nums text-fg">{attempt.percentage}%</span>
                  <Badge tone={attempt.passed ? 'green' : 'red'}>{attempt.passed ? 'O‘tdi' : 'O‘tmadi'}</Badge>
                  {attempt.status === 'NEEDS_REVIEW' && <Badge tone="yellow">Baholash kerak</Badge>}
                </div>
              </div>

              {attempt.topics.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {attempt.topics.map((topic) => (
                    <li key={topic.topicId ?? topic.topicTitle} className="flex items-center gap-2 text-sm">
                      <span className="w-40 shrink-0 truncate text-fg-muted">{topic.topicTitle}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            topic.percent >= 85 ? 'bg-emerald-500' : topic.percent >= 60 ? 'bg-brand-500' : 'bg-red-500',
                          )}
                          style={{ width: `${topic.percent}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">{topic.percent}%</span>
                    </li>
                  ))}
                </ul>
              )}

              {attempt.weakTopics.length > 0 && (
                <p className="mt-2 text-sm text-fg-muted">
                  Takrorlash kerak: <span className="text-fg">{attempt.weakTopics.join(', ')}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
