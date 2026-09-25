import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, Upload, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { usePortal } from '@/layouts/PortalContext';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { AttemptQuestionView, AttemptView } from '@/types/portal';
import { EXAM_TYPE_LABELS } from '@/utils/homeworkLabels';
import { QUESTION_TYPE_SHORT, isChoiceQuestion } from '@/utils/questionLabels';

type Answer = { optionIds: string[]; text: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const TEXT_SAVE_DELAY_MS = 800;

function remainingLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function isAnswered(question: AttemptQuestionView, answer: Answer | undefined): boolean {
  if (question.type === 'FILE_UPLOAD') return question.answer.hasFile;
  if (isChoiceQuestion(question.type)) return (answer?.optionIds.length ?? 0) > 0;
  return Boolean(answer?.text.trim());
}

/**
 * Onlayn imtihon (TZ §21–25): savollar snapshotdan, javoblar avtomatik saqlanadi (variant —
 * darhol, matn — yozish to'xtagach), taymer tugasa server saqlangan javoblar bilan yakunlaydi.
 * Topshirilgach — natija, to'g'ri javoblar va tushuntirish (o'qituvchi tekshirishi kerak bo'lsa — kutish).
 */
export default function PortalAttemptPage() {
  const { id = '' } = useParams();
  const { me, activeChild } = usePortal();
  const isStudent = me.kind === 'STUDENT';
  const query = useQuery({ queryKey: queryKeys.portal.attempt(id), queryFn: () => portalService.attempt(id, isStudent ? undefined : activeChild) });

  return (
    <div>
      <Link to="/portal/exams" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Imtihonlar
      </Link>
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.status === 'IN_PROGRESS' && isStudent ? (
        <TakeExam view={query.data} />
      ) : (
        <AttemptResult view={query.data} />
      )}
    </div>
  );
}

function TakeExam({ view }: { view: AttemptView }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(view.questions.map((question) => [question.id, { optionIds: question.answer.optionIds, text: question.answer.text ?? '' }])),
  );
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const deadline = view.deadline ? new Date(view.deadline).getTime() : null;
  const remaining = deadline === null ? null : deadline - now;
  const expired = remaining !== null && remaining <= 0;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.portal.attempt(view.attemptId) });
    void queryClient.invalidateQueries({ queryKey: ['portal', 'exams'] });
  }, [queryClient, view.attemptId]);

  const save = useCallback(
    async (question: AttemptQuestionView, answer: Answer) => {
      setSaveState((current) => ({ ...current, [question.id]: 'saving' }));
      try {
        await portalService.saveExamAnswer(view.attemptId, question.id, isChoiceQuestion(question.type) ? { optionIds: answer.optionIds } : { text: answer.text });
        setSaveState((current) => ({ ...current, [question.id]: 'saved' }));
      } catch (error) {
        setSaveState((current) => ({ ...current, [question.id]: 'error' }));
        toast.error(getErrorMessage(error));
        // Vaqt tugagan bo'lsa server urinishni yakunlagan — natijaga o'tamiz
        refresh();
      }
    },
    [view.attemptId, refresh],
  );

  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  // Taymer tugadi — server saqlangan javoblar bilan yakunlaydi; natijani qayta yuklaymiz
  useEffect(() => {
    if (expired) refresh();
  }, [expired, refresh]);

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  function change(question: AttemptQuestionView, next: Answer, immediate: boolean) {
    setAnswers((current) => ({ ...current, [question.id]: next }));
    clearTimeout(timers.current[question.id]);
    if (immediate) void save(question, next);
    else timers.current[question.id] = setTimeout(() => void save(question, next), TEXT_SAVE_DELAY_MS);
  }

  const upload = useMutation({
    mutationFn: ({ question, file }: { question: AttemptQuestionView; file: File }) => portalService.uploadExamAnswerFile(view.attemptId, question.id, file),
    onSuccess: () => {
      toast.success('Fayl saqlandi');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = useMutation({
    mutationFn: async () => {
      // Kutilayotgan matn saqlashlari avval yuboriladi
      const pending = Object.keys(timers.current);
      for (const questionId of pending) clearTimeout(timers.current[questionId]);
      timers.current = {};
      await Promise.all(
        view.questions.filter((question) => pending.includes(question.id)).map((question) => save(question, answers[question.id]!)),
      );
      return portalService.submitExam(view.attemptId);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setConfirmOpen(false);
      queryClient.setQueryData(queryKeys.portal.attempt(view.attemptId), result.data);
      void queryClient.invalidateQueries({ queryKey: ['portal', 'exams'] });
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error(getErrorMessage(error));
      refresh();
    },
  });

  const unanswered = view.questions.filter((question) => !isAnswered(question, answers[question.id])).length;

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-fg">{view.examTitle}</h1>
          <p className="text-xs text-fg-muted">
            {EXAM_TYPE_LABELS[view.examType]} · {view.questions.length - unanswered}/{view.questions.length} javob berildi
          </p>
        </div>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span
              role="timer"
              aria-label="Qolgan vaqt"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-sm tabular-nums',
                remaining < 60_000 ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-surface-muted text-fg',
              )}
            >
              <Clock className="size-4" aria-hidden /> {remainingLabel(remaining)}
            </span>
          )}
          <Button onClick={() => setConfirmOpen(true)} disabled={expired}>
            Topshirish
          </Button>
        </div>
      </div>

      {expired && <Alert tone="warning" className="mb-4">Vaqt tugadi — javoblaringiz avtomatik topshirilmoqda…</Alert>}

      <ol className="space-y-4">
        {view.questions.map((question) => {
          const answer = answers[question.id]!;
          const state = saveState[question.id] ?? 'idle';
          return (
            <li key={question.id}>
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p id={`q-${question.id}`} className="font-medium text-fg">
                      {question.order}. {question.text}
                    </p>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                      <Badge tone="gray">{QUESTION_TYPE_SHORT[question.type]}</Badge>
                      {question.points} ball
                    </span>
                  </div>

                  {isChoiceQuestion(question.type) ? (
                    <fieldset aria-labelledby={`q-${question.id}`} className="space-y-2" disabled={expired}>
                      {question.options.map((option) => {
                        const multiple = question.type === 'MULTIPLE_CHOICE';
                        const checked = answer.optionIds.includes(option.id);
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                              checked ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-border hover:bg-surface-muted',
                            )}
                          >
                            <input
                              type={multiple ? 'checkbox' : 'radio'}
                              name={`q-${question.id}`}
                              checked={checked}
                              className="accent-brand-600"
                              onChange={() => {
                                const optionIds = multiple ? (checked ? answer.optionIds.filter((value) => value !== option.id) : [...answer.optionIds, option.id]) : [option.id];
                                change(question, { ...answer, optionIds }, true);
                              }}
                            />
                            <span className="text-fg">{option.text}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : question.type === 'FILE_UPLOAD' ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-fg hover:bg-surface-muted">
                        <Upload className="size-4" aria-hidden />
                        {question.answer.hasFile ? 'Faylni almashtirish' : 'Fayl tanlash'}
                        <input
                          type="file"
                          accept="application/pdf,image/png,image/jpeg,image/webp"
                          className="sr-only"
                          aria-label={`${question.order}-savolga fayl`}
                          disabled={expired || upload.isPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (file) upload.mutate({ question, file });
                          }}
                        />
                      </label>
                      <span className="text-xs text-fg-subtle">{question.answer.hasFile ? 'Fayl yuklangan' : 'PDF yoki rasm (JPG, PNG, WEBP)'}</span>
                    </div>
                  ) : question.type === 'SHORT_TEXT' ? (
                    <Input
                      aria-labelledby={`q-${question.id}`}
                      value={answer.text}
                      maxLength={200}
                      disabled={expired}
                      onChange={(event) => change(question, { ...answer, text: event.target.value }, false)}
                    />
                  ) : (
                    <Textarea
                      aria-labelledby={`q-${question.id}`}
                      rows={question.type === 'CODE' ? 8 : 5}
                      className={question.type === 'CODE' ? 'font-mono text-sm' : undefined}
                      spellCheck={question.type !== 'CODE'}
                      value={answer.text}
                      disabled={expired}
                      onChange={(event) => change(question, { ...answer, text: event.target.value }, false)}
                    />
                  )}

                  <p className="h-4 text-xs text-fg-subtle" aria-live="polite">
                    {state === 'saving' ? 'Saqlanmoqda…' : state === 'saved' ? 'Saqlandi' : state === 'error' ? 'Saqlanmadi' : ''}
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => setConfirmOpen(true)} disabled={expired}>
          Topshirish
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Imtihonni topshirasizmi?"
        description={
          unanswered > 0
            ? `${unanswered} ta savolga javob berilmagan — ular 0 ball bo‘ladi. Topshirgandan keyin o‘zgartirib bo‘lmaydi.`
            : 'Topshirgandan keyin javoblarni o‘zgartirib bo‘lmaydi.'
        }
        confirmLabel="Topshirish"
        tone="primary"
        loading={submit.isPending}
        onConfirm={() => submit.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

function AttemptResult({ view }: { view: AttemptView }) {
  const reviewing = view.status === 'NEEDS_REVIEW';
  return (
    <>
      <PageHeader title={view.examTitle} description={EXAM_TYPE_LABELS[view.examType]} />
      {view.status === 'IN_PROGRESS' ? (
        <Alert tone="info">Imtihon hali topshirilmoqda.</Alert>
      ) : (
        view.summary && (
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-center gap-4 pt-4">
              <span className="text-3xl font-semibold tabular-nums text-fg">{view.summary.percentage}%</span>
              <span className="text-sm text-fg-muted">
                {view.summary.score}/{view.summary.maxScore} ball
              </span>
              {reviewing ? (
                <Badge tone="yellow">O‘qituvchi tekshirmoqda</Badge>
              ) : (
                <Badge tone={view.summary.passed ? 'green' : 'red'}>{view.summary.passed ? 'O‘tdi' : 'O‘tmadi'}</Badge>
              )}
            </CardContent>
          </Card>
        )
      )}
      {reviewing && (
        <Alert tone="info" className="mb-4">
          Ayrim javoblarni o‘qituvchi tekshiradi. Yakuniy ball, to‘g‘ri javoblar va tushuntirishlar baholangandan keyin ko‘rinadi.
        </Alert>
      )}

      <ol className="space-y-3">
        {view.questions.map((question) => (
          <li key={question.id}>
            <Card>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-fg">
                    {question.order}. {question.text}
                  </p>
                  {question.result && <ResultMark question={question} />}
                </div>
                {question.options.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {question.options.map((option) => {
                      const chosen = question.answer.optionIds.includes(option.id);
                      const correct = question.result?.correctOptionIds.includes(option.id) ?? false;
                      const graded = view.status === 'GRADED';
                      return (
                        <li
                          key={option.id}
                          className={cn(
                            'rounded-md px-2 py-1',
                            correct
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                              : chosen && graded
                                ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200'
                                : chosen
                                  ? 'bg-brand-50 text-fg dark:bg-brand-950'
                                  : 'text-fg-muted',
                          )}
                        >
                          {option.text}
                          {chosen && ' — sizning javobingiz'}
                          {correct && ' ✓'}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {question.answer.text && <pre className="whitespace-pre-wrap rounded-md bg-surface-muted p-2 text-sm text-fg">{question.answer.text}</pre>}
                {question.answer.hasFile && <p className="text-sm text-fg-muted">Fayl yuklangan</p>}
                {question.result?.feedback && <p className="text-sm text-fg">O‘qituvchi izohi: {question.result.feedback}</p>}
                {question.result?.explanation && <p className="text-sm text-fg-muted">Tushuntirish: {question.result.explanation}</p>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

function ResultMark({ question }: { question: AttemptQuestionView }) {
  const result = question.result!;
  if (result.isCorrect === null) return <Badge tone="yellow">Tekshirilmoqda</Badge>;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-sm tabular-nums', result.isCorrect || result.score > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {result.isCorrect || result.score > 0 ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
      {result.score}/{question.points}
    </span>
  );
}
