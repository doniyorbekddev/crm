import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { questionsService } from '@/services/questions.service';
import type { ExamAttempt } from '@/types/question';
import { QUESTION_TYPE_SHORT } from '@/utils/questionLabels';

interface Draft {
  score: string;
  feedback: string;
}

/**
 * O'qituvchi qo'lda baholanadigan javoblarni (esse, kod, fayl, mos kelmagan qisqa javob)
 * ko'radi va ball qo'yadi. Yakuniy baho — o'qituvchida (TZ §0.2).
 */
export function AttemptReviewModal({ attempt, onClose, onGraded }: { attempt: ExamAttempt; onClose: () => void; onGraded: () => void }) {
  const pending = attempt.answers.filter((answer) => answer.needsReview);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(pending.map((answer) => [answer.id, { score: '', feedback: '' }])));
  const [formError, setFormError] = useState<string | null>(null);

  const invalid = pending.some((answer) => {
    const value = drafts[answer.id]?.score ?? '';
    return value === '' || !/^\d{1,3}$/.test(value) || Number(value) > answer.points;
  });

  const grade = useMutation({
    mutationFn: () =>
      questionsService.gradeAttempt(
        attempt.id,
        pending.map((answer) => ({
          answerId: answer.id,
          score: Number(drafts[answer.id]!.score),
          ...(drafts[answer.id]!.feedback.trim() ? { feedback: drafts[answer.id]!.feedback.trim() } : {}),
        })),
      ),
    onSuccess: (result) => {
      toast.success(result.message);
      onGraded();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const download = useMutation({
    mutationFn: (answerId: string) => questionsService.downloadAnswerFile(attempt.id, answerId),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const patch = (id: string, next: Partial<Draft>) => setDrafts((current) => ({ ...current, [id]: { ...current[id]!, ...next } }));

  return (
    <Modal
      open
      size="lg"
      title="Javoblarni baholash"
      description={`${attempt.studentName} · ${attempt.examTitle} · ${attempt.attemptNo}-urinish`}
      onClose={onClose}
      closeDisabled={grade.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={grade.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => grade.mutate()} loading={grade.isPending} disabled={invalid || pending.length === 0}>
            Baholash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <p className="mb-4 text-sm text-fg-muted">
        Avtomatik baholangan: {attempt.score}/{attempt.maxScore} ball. Tekshirilishi kerak: {pending.length} ta javob.
      </p>
      <ol className="space-y-4">
        {pending.map((answer, index) => (
          <li key={answer.id} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-medium text-fg">
                {index + 1}. {answer.questionText}
              </span>
              <Badge tone="gray">{QUESTION_TYPE_SHORT[answer.questionType]}</Badge>
              <span className="text-xs text-fg-subtle">{answer.points} ball</span>
            </div>
            {answer.text && (
              <pre className="mb-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-2 text-sm text-fg">{answer.text}</pre>
            )}
            {answer.hasFile && (
              <Button
                variant="secondary"
                className="mb-2"
                leftIcon={<Download className="size-4" aria-hidden />}
                loading={download.isPending && download.variables === answer.id}
                onClick={() => download.mutate(answer.id)}
              >
                Faylni yuklab olish
              </Button>
            )}
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <FormField label={`Ball (0–${answer.points})`} htmlFor={`grade-${answer.id}`}>
                <Input id={`grade-${answer.id}`} inputMode="numeric" value={drafts[answer.id]?.score ?? ''} onChange={(event) => patch(answer.id, { score: event.target.value })} />
              </FormField>
              <FormField label="Izoh" htmlFor={`feedback-${answer.id}`} hint="O‘quvchi natijada ko‘radi">
                <Textarea id={`feedback-${answer.id}`} rows={2} value={drafts[answer.id]?.feedback ?? ''} onChange={(event) => patch(answer.id, { feedback: event.target.value })} />
              </FormField>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
