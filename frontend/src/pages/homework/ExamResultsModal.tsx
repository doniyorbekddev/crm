import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { examsService } from '@/services/homework.service';
import type { ExamResultRecord } from '@/types/homework';
import { formatDate, formatNumber } from '@/utils/format';
import { EXAM_STATUS_LABELS, EXAM_STATUS_TONES, GRADE_TONES, gradeLetter } from '@/utils/homeworkLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface ExamResultsModalProps {
  examId: string;
  onClose: () => void;
  onChanged: () => void;
}

export function ExamResultsModal({ examId, onClose, onChanged }: ExamResultsModalProps) {
  const queryClient = useQueryClient();
  const canGrade = usePermission(PERMISSIONS.EXAM_GRADE);
  /** Faqat o‘zgartirilgan ballar */
  const [draft, setDraft] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: queryKeys.exams.detail(examId),
    queryFn: () => examsService.detail(examId),
  });

  const save = useMutation({
    mutationFn: (records: ExamResultRecord[]) => examsService.saveResults(examId, records),
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft({});
      queryClient.setQueryData(queryKeys.exams.detail(examId), result.data);
      onChanged();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const exam = detailQuery.data;
  const records: ExamResultRecord[] = Object.entries(draft)
    .filter(([, value]) => value !== '')
    .map(([studentId, value]) => ({ studentId, score: Number(value) }));
  const tooHigh = exam ? records.some((record) => record.score > exam.maxScore) : false;

  return (
    <Modal
      open
      title={exam?.title ?? 'Imtihon natijalari'}
      description={exam ? `${exam.group.name} · ${formatDate(exam.date)} · maksimal ${exam.maxScore} ball` : undefined}
      onClose={onClose}
      closeDisabled={save.isPending}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Yopish
          </Button>
          {canGrade && (
            <Button
              leftIcon={<Save className="size-4" aria-hidden />}
              loading={save.isPending}
              disabled={records.length === 0 || tooHigh}
              onClick={() => save.mutate(records)}
            >
              Natijalarni saqlash{records.length > 0 && ` (${records.length})`}
            </Button>
          )}
        </>
      }
    >
      {detailQuery.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : detailQuery.isError ? (
        <Alert tone="error">{getErrorMessage(detailQuery.error)}</Alert>
      ) : exam ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={EXAM_STATUS_TONES[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Badge>
            {exam.passScore !== null && <span className="text-xs text-fg-muted">O‘tish bali: {exam.passScore}</span>}
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'Baholandi', value: `${formatNumber(exam.stats.graded)} / ${formatNumber(exam.stats.students)}` },
              { label: 'O‘rtacha', value: `${exam.stats.averagePercentage}%` },
              { label: 'O‘tdi', value: exam.passScore === null ? '—' : `${exam.stats.passRate}%` },
              { label: 'Eng yuqori / past', value: exam.stats.graded ? `${exam.stats.highest} / ${exam.stats.lowest}` : '—' },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border bg-surface-muted p-3">
                <p className="text-xs text-fg-muted">{tile.label}</p>
                <p className="mt-1 text-base font-semibold text-fg">{tile.value}</p>
              </div>
            ))}
          </div>

          {exam.status === 'CANCELLED' && <Alert tone="warning">Imtihon bekor qilingan — natija kiritilmaydi.</Alert>}
          {tooHigh && <Alert tone="warning">Ba’zi ballar maksimal balldan ({exam.maxScore}) katta.</Alert>}

          {exam.results.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">Guruhda faol o‘quvchi yo‘q</p>
          ) : (
            <ul className={cn('divide-y divide-border rounded-xl border border-border', save.isPending && 'opacity-60')}>
              {exam.results.map((result) => {
                const value = draft[result.studentId] ?? (result.score === null ? '' : String(result.score));
                const score = value === '' ? null : Number(value);
                const percentage = score === null ? null : Math.round((score / exam.maxScore) * 100);
                const grade = percentage === null ? null : gradeLetter(percentage);
                const passed = score === null || exam.passScore === null ? null : score >= exam.passScore;
                return (
                  <li key={result.studentId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">
                        {result.firstName} {result.lastName}
                      </p>
                      <p className="text-xs text-fg-muted">
                        <span className="font-mono">{result.code}</span>
                        {result.xpAwarded > 0 && ` · +${result.xpAwarded} XP`}
                        {result.comment && ` · ${result.comment}`}
                      </p>
                    </div>
                    {canGrade && exam.status !== 'CANCELLED' ? (
                      <Input
                        value={value}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, [result.studentId]: event.target.value.replace(/\D/g, '') }))
                        }
                        inputMode="numeric"
                        aria-label={`${result.firstName} bali`}
                        placeholder={`0–${exam.maxScore}`}
                        invalid={score !== null && score > exam.maxScore}
                        className="h-9 w-24"
                      />
                    ) : (
                      <span className="w-16 text-right text-sm text-fg">{score === null ? '—' : score}</span>
                    )}
                    <span className="w-12 text-right text-sm tabular-nums text-fg-muted">
                      {percentage === null ? '—' : `${percentage}%`}
                    </span>
                    <span className="w-8 text-center">
                      {grade ? <Badge tone={GRADE_TONES[grade] ?? 'gray'}>{grade}</Badge> : <span className="text-fg-subtle">—</span>}
                    </span>
                    <span className="w-16 text-right text-xs">
                      {passed === null ? (
                        <span className="text-fg-subtle">—</span>
                      ) : passed ? (
                        <span className="text-emerald-600 dark:text-emerald-400">O‘tdi</span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">O‘tmadi</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
