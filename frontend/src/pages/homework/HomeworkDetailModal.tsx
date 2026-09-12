import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { homeworkService } from '@/services/homework.service';
import type { GradeRecord, HomeworkDetail, SubmissionStatus } from '@/types/homework';
import { formatDateTime, formatNumber } from '@/utils/format';
import {
  HOMEWORK_STATUS_LABELS,
  HOMEWORK_STATUS_TONES,
  SUBMISSION_STATUS_LABELS,
  SUBMISSION_STATUS_ORDER,
  SUBMISSION_STATUS_TONES,
} from '@/utils/homeworkLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface HomeworkDetailModalProps {
  homeworkId: string;
  onClose: () => void;
  onChanged: () => void;
}

type Draft = Record<string, { status?: SubmissionStatus; score?: string; feedback?: string }>;

function GradingTable({
  detail,
  draft,
  setDraft,
  canGrade,
}: {
  detail: HomeworkDetail;
  draft: Draft;
  setDraft: (update: (current: Draft) => Draft) => void;
  canGrade: boolean;
}) {
  const patch = (studentId: string, values: Draft[string]) =>
    setDraft((current) => ({ ...current, [studentId]: { ...current[studentId], ...values } }));

  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {detail.submissions.map((submission) => {
        const edit = draft[submission.studentId] ?? {};
        const status = edit.status ?? submission.status;
        const score = edit.score ?? (submission.score === null ? '' : String(submission.score));
        return (
          <li key={submission.studentId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">
                {submission.firstName} {submission.lastName}
              </p>
              <p className="text-xs text-fg-muted">
                <span className="font-mono">{submission.code}</span>
                {submission.submittedAt && ` · ${formatDateTime(submission.submittedAt)}`}
                {submission.xpAwarded > 0 && ` · +${submission.xpAwarded} XP`}
              </p>
            </div>

            {canGrade ? (
              <>
                <Select
                  value={status}
                  onChange={(event) => patch(submission.studentId, { status: event.target.value as SubmissionStatus })}
                  aria-label={`${submission.firstName} holati`}
                  wrapperClassName="w-36"
                  className="h-9"
                >
                  {SUBMISSION_STATUS_ORDER.map((item) => (
                    <option key={item} value={item}>
                      {SUBMISSION_STATUS_LABELS[item]}
                    </option>
                  ))}
                </Select>
                <Input
                  value={score}
                  onChange={(event) => patch(submission.studentId, { score: event.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                  aria-label={`${submission.firstName} bali`}
                  placeholder={`0–${detail.maxPoints}`}
                  className="h-9 w-24"
                />
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Badge tone={SUBMISSION_STATUS_TONES[submission.status]}>{SUBMISSION_STATUS_LABELS[submission.status]}</Badge>
                <span className="w-16 text-right text-sm text-fg">
                  {submission.score === null ? '—' : `${submission.score}/${detail.maxPoints}`}
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function HomeworkDetailModal({ homeworkId, onClose, onChanged }: HomeworkDetailModalProps) {
  const queryClient = useQueryClient();
  const canGrade = usePermission(PERMISSIONS.HOMEWORK_GRADE);
  const [draft, setDraft] = useState<Draft>({});

  const detailQuery = useQuery({
    queryKey: queryKeys.homework.detail(homeworkId),
    queryFn: () => homeworkService.detail(homeworkId),
  });

  const save = useMutation({
    mutationFn: (records: GradeRecord[]) => homeworkService.grade(homeworkId, records),
    onSuccess: (result) => {
      toast.success(result.message);
      setDraft({});
      queryClient.setQueryData(queryKeys.homework.detail(homeworkId), result.data);
      onChanged();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const detail = detailQuery.data;

  const buildRecords = (): GradeRecord[] =>
    Object.entries(draft).flatMap(([studentId, values]) => {
      const record: GradeRecord = { studentId };
      if (values.status) record.status = values.status;
      if (values.score !== undefined && values.score !== '') record.score = Number(values.score);
      if (values.feedback) record.feedback = values.feedback;
      return record.status || record.score !== undefined || record.feedback ? [record] : [];
    });

  /** "Hammasi topshirdi" — bir bosishda butun guruh (3-click qoidasi) */
  const markAllSubmitted = () => {
    if (!detail) return;
    setDraft((current) => {
      const next = { ...current };
      for (const submission of detail.submissions) {
        if (submission.status === 'PENDING') {
          next[submission.studentId] = { ...next[submission.studentId], status: 'SUBMITTED' };
        }
      }
      return next;
    });
  };

  const records = buildRecords();

  return (
    <Modal
      open
      title={detail?.title ?? 'Uy vazifasi'}
      description={detail ? `${detail.group.name} · muddat: ${formatDateTime(detail.deadline)}` : undefined}
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
              type="button"
              leftIcon={<Save className="size-4" aria-hidden />}
              loading={save.isPending}
              disabled={records.length === 0}
              onClick={() => save.mutate(records)}
            >
              Saqlash{records.length > 0 && ` (${records.length})`}
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
      ) : detail ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={HOMEWORK_STATUS_TONES[detail.status]}>{HOMEWORK_STATUS_LABELS[detail.status]}</Badge>
            {detail.isOverdue && <Badge tone="red">Muddati o‘tgan</Badge>}
            <span className="text-xs text-fg-muted">
              Maksimal ball: {detail.maxPoints} · XP: {detail.xpReward}
            </span>
          </div>

          {detail.description && <p className="text-sm text-fg-muted">{detail.description}</p>}

          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: 'O‘quvchilar', value: formatNumber(detail.stats.students) },
              { label: 'Topshirdi', value: `${formatNumber(detail.stats.submitted)} (${detail.stats.submissionRate}%)` },
              { label: 'Baholandi', value: formatNumber(detail.stats.graded) },
              { label: 'O‘rtacha ball', value: formatNumber(detail.stats.averageScore) },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border bg-surface-muted p-3">
                <p className="text-xs text-fg-muted">{tile.label}</p>
                <p className="mt-1 text-base font-semibold text-fg">{tile.value}</p>
              </div>
            ))}
          </div>

          {detail.status === 'DRAFT' ? (
            <Alert tone="info">Vazifa qoralama holatida — e’lon qilinganda o‘quvchilar ro‘yxati ochiladi.</Alert>
          ) : (
            <>
              {canGrade && detail.stats.pending > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<CheckCheck className="size-4" aria-hidden />}
                  onClick={markAllSubmitted}
                >
                  Kutilayotganlarni topshirdi deb belgilash ({detail.stats.pending})
                </Button>
              )}
              <div className={cn(save.isPending && 'pointer-events-none opacity-60')}>
                <GradingTable detail={detail} draft={draft} setDraft={setDraft} canGrade={canGrade} />
              </div>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
