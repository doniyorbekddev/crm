import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { homeworkService } from '@/services/homework.service';
import type { HomeworkDetail } from '@/types/homework';
import { formatDateTime } from '@/utils/format';
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';
import { formatFileSize } from '@/utils/lessonLabels';

interface SubmissionReviewModalProps {
  homework: HomeworkDetail;
  studentId: string;
  canGrade: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Rubrika bo‘yicha foizlardan ball (backend bilan bir xil formula — ko‘rsatish uchun) */
export function rubricScore(criteria: Array<{ key: string; weight: number }>, scores: Record<string, number>, maxPoints: number): number | null {
  if (criteria.some((criterion) => scores[criterion.key] === undefined)) return null;
  const percent = criteria.reduce((sum, criterion) => sum + criterion.weight * (scores[criterion.key] ?? 0), 0) / 100;
  return Math.round((percent / 100) * maxPoints);
}

/**
 * O‘qituvchi bitta topshiriqni ko‘radi (TZ §19): javob, havola, kod, fayllar, kechikdimi;
 * amallar — baholash (ball yoki rubrika), izoh, qayta ishlashga qaytarish.
 * AI tahlili PHASE 9 da shu oynaga qo‘shiladi (o‘qituvchi yakuniy qaror beradi).
 */
export function SubmissionReviewModal({ homework, studentId, canGrade, onClose, onChanged }: SubmissionReviewModalProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.homework.submission(homework.id, studentId),
    queryFn: () => homeworkService.submission(homework.id, studentId),
  });
  const [score, setScore] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [rubric, setRubric] = useState<Record<string, number> | null>(null);

  const submission = query.data;
  const criteria = homework.rubricCriteria;
  const currentRubric = rubric ?? submission?.rubricScores ?? {};
  const currentFeedback = feedback ?? submission?.feedback ?? '';
  const computed = criteria ? rubricScore(criteria, currentRubric, homework.maxPoints) : null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.homework.all });
    onChanged();
  };

  const grade = useMutation({
    mutationFn: () =>
      homeworkService.gradeOne(homework.id, studentId, {
        ...(criteria ? { rubricScores: currentRubric } : { score: Number(score ?? submission?.score ?? 0) }),
        ...(currentFeedback.trim() ? { feedback: currentFeedback.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const giveBack = useMutation({
    mutationFn: () => homeworkService.returnSubmission(homework.id, studentId, currentFeedback.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submitted = submission && ['SUBMITTED', 'LATE', 'GRADED'].includes(submission.status);
  const scoreValue = score ?? (submission?.score === null || submission?.score === undefined ? '' : String(submission.score));
  const gradeDisabled = criteria ? computed === null : scoreValue === '' || Number(scoreValue) > homework.maxPoints;

  return (
    <Modal
      open
      size="lg"
      title={submission ? `${submission.firstName} ${submission.lastName}` : 'Topshiriq'}
      description={homework.title}
      onClose={onClose}
      closeDisabled={grade.isPending || giveBack.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
          {canGrade && submitted && (
            <>
              <Button
                variant="secondary"
                leftIcon={<RotateCcw className="size-4" aria-hidden />}
                loading={giveBack.isPending}
                disabled={currentFeedback.trim().length < 3}
                title="Izohda nimani tuzatish kerakligini yozing"
                onClick={() => giveBack.mutate()}
              >
                Qayta ishlashga qaytarish
              </Button>
              <Button leftIcon={<Save className="size-4" aria-hidden />} loading={grade.isPending} disabled={gradeDisabled} onClick={() => grade.mutate()}>
                Baholash
              </Button>
            </>
          )}
        </>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <Alert tone="error">{getErrorMessage(query.error)}</Alert>
      ) : submission ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={SUBMISSION_STATUS_TONES[submission.status]}>{SUBMISSION_STATUS_LABELS[submission.status]}</Badge>
            {submission.late && <Badge tone="yellow">Kechikib topshirilgan</Badge>}
            {submission.submittedAt && <span className="text-fg-muted">Topshirilgan: {formatDateTime(submission.submittedAt)}</span>}
            {submission.returnedAt && <span className="text-fg-muted">· qaytarilgan: {formatDateTime(submission.returnedAt)}</span>}
          </div>

          {!submission.answerText && !submission.linkUrl && !submission.codeText && submission.files.length === 0 ? (
            <Alert tone="info">O‘quvchi hali hech narsa topshirmagan.</Alert>
          ) : (
            <div className="space-y-3">
              {submission.answerText && (
                <section>
                  <p className="mb-1 text-xs font-medium text-fg-muted">Javob</p>
                  <p className="rounded-lg border border-border bg-surface-muted p-3 text-sm whitespace-pre-wrap text-fg">{submission.answerText}</p>
                </section>
              )}
              {submission.linkUrl && (
                <a href={submission.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-300">
                  <ExternalLink className="size-4" aria-hidden />
                  {submission.linkUrl}
                </a>
              )}
              {submission.codeText && (
                <section>
                  <p className="mb-1 text-xs font-medium text-fg-muted">Kod{submission.codeLanguage ? ` · ${submission.codeLanguage}` : ''}</p>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-slate-950 p-3 text-xs text-slate-100">
                    <code>{submission.codeText}</code>
                  </pre>
                </section>
              )}
              {submission.files.length > 0 && (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {submission.files.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-fg">{file.originalName}</span>
                      <button
                        type="button"
                        onClick={() => void homeworkService.downloadSubmissionFile(homework.id, studentId, file).catch((error: unknown) => toast.error(getErrorMessage(error)))}
                        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-300"
                      >
                        <Download className="size-3.5" aria-hidden />
                        {file.size > 0 ? formatFileSize(file.size) : 'Yuklab olish'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {canGrade && (
            <div className="space-y-3 border-t border-border pt-4">
              {criteria ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-fg">
                    Rubrika{computed !== null && <span className="ml-2 text-fg-muted">→ {computed}/{homework.maxPoints} ball</span>}
                  </p>
                  {criteria.map((criterion) => (
                    <div key={criterion.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <label htmlFor={`rubric-${criterion.key}`} className="text-sm text-fg">
                        {criterion.title} <span className="text-xs text-fg-muted">({criterion.weight}%)</span>
                      </label>
                      <Input
                        id={`rubric-${criterion.key}`}
                        inputMode="numeric"
                        placeholder="0–100"
                        className="h-9 w-24"
                        value={currentRubric[criterion.key] === undefined ? '' : String(currentRubric[criterion.key])}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '').slice(0, 3);
                          const next = { ...currentRubric };
                          if (digits === '') delete next[criterion.key];
                          else next[criterion.key] = Math.min(100, Number(digits));
                          setRubric(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <FormField label={`Ball (0–${homework.maxPoints})`} htmlFor="review-score">
                  <Input id="review-score" inputMode="numeric" className="w-32" value={scoreValue} onChange={(event) => setScore(event.target.value.replace(/\D/g, ''))} />
                </FormField>
              )}
              <FormField label="Izoh" htmlFor="review-feedback" hint="Qaytarishda majburiy — nimani tuzatish kerak">
                <Textarea id="review-feedback" rows={3} maxLength={500} value={currentFeedback} onChange={(event) => setFeedback(event.target.value)} />
              </FormField>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
