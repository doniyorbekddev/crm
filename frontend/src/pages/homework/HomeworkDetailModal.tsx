import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, Code2, Eye, FileText, Link2, Paperclip, Save, Trash2, Type } from 'lucide-react';
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
import { MaterialList } from '@/components/lesson/LessonBody';
import { DIFFICULTY_LABELS, DIFFICULTY_TONES, HOMEWORK_TARGET_LABELS } from '@/utils/homeworkLabels';
import { SubmissionReviewModal } from './SubmissionReviewModal';

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
  onOpen,
}: {
  detail: HomeworkDetail;
  draft: Draft;
  setDraft: (update: (current: Draft) => Draft) => void;
  canGrade: boolean;
  onOpen: (studentId: string) => void;
}) {
  // Rubrikali vazifada ball faqat rubrika orqali (javobni ochib) qo'yiladi
  const directScore = canGrade && !detail.rubricCriteria;
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
              <p className="mt-0.5 flex items-center gap-2 text-fg-subtle" aria-label="Topshirilgan narsalar">
                {submission.hasText && <Type className="size-3.5" aria-label="Matn" />}
                {submission.hasLink && <Link2 className="size-3.5" aria-label="Havola" />}
                {submission.hasCode && <Code2 className="size-3.5" aria-label="Kod" />}
                {submission.fileCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs">
                    <Paperclip className="size-3.5" aria-hidden />
                    {submission.fileCount}
                  </span>
                )}
              </p>
            </div>

            <Button variant="ghost" size="sm" leftIcon={<Eye className="size-4" aria-hidden />} onClick={() => onOpen(submission.studentId)}>
              Ko‘rish
            </Button>

            {directScore ? (
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
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const canManage = usePermission(PERMISSIONS.HOMEWORK_MANAGE);
  const [link, setLink] = useState({ title: '', url: '' });

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

  const refreshDetail = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.homework.detail(homeworkId) });
    onChanged();
  };
  const addLink = useMutation({
    mutationFn: () => homeworkService.addLink(homeworkId, { title: link.title.trim(), url: link.url.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setLink({ title: '', url: '' });
      refreshDetail();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const upload = useMutation({
    mutationFn: (file: File) => homeworkService.uploadAttachment(homeworkId, file),
    onSuccess: (result) => {
      toast.success(result.message);
      refreshDetail();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => homeworkService.removeAttachment(attachmentId),
    onSuccess: (message) => {
      toast.success(message);
      refreshDetail();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

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
            <Badge>{HOMEWORK_TARGET_LABELS[detail.targetType]}</Badge>
            {detail.difficulty && <Badge tone={DIFFICULTY_TONES[detail.difficulty]}>{DIFFICULTY_LABELS[detail.difficulty]}</Badge>}
            {detail.rubric && <Badge tone="purple">Rubrika: {detail.rubric.name}</Badge>}
            <span className="text-xs text-fg-muted">
              Maksimal ball: {detail.maxPoints} · XP: {detail.xpReward}
              {detail.topic && ` · mavzu: ${detail.topic.title}`}
              {detail.lesson && ` · dars: ${detail.lesson.title}`}
            </span>
          </div>

          {detail.description && <p className="text-sm text-fg-muted">{detail.description}</p>}

          <section className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-fg">
              <FileText className="size-4 text-fg-muted" aria-hidden />
              Biriktirilgan fayl va havolalar
            </p>
            {detail.attachments.length > 0 && (
              <MaterialList
                materials={detail.attachments.map((item, index) => ({ ...item, sortOrder: index }))}
                onDownload={(item) =>
                  void homeworkService.downloadAttachment(detail.attachments.find((a) => a.id === item.id)!).catch((error: unknown) => toast.error(getErrorMessage(error)))
                }
                renderAction={
                  canManage
                    ? (item) => (
                        <button
                          type="button"
                          aria-label={`${item.title} — o‘chirish`}
                          onClick={() => removeAttachment.mutate(item.id)}
                          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      )
                    : undefined
                }
              />
            )}
            {canManage && (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                <Input aria-label="Havola nomi" placeholder="Nomi (masalan, Figma maket)" value={link.title} onChange={(event) => setLink({ ...link, title: event.target.value })} />
                <Input aria-label="Havola" type="url" placeholder="https://…" value={link.url} onChange={(event) => setLink({ ...link, url: event.target.value })} />
                <Button variant="secondary" loading={addLink.isPending} disabled={link.title.trim().length < 2 || !link.url.trim()} onClick={() => addLink.mutate()}>
                  Havola
                </Button>
                <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-fg hover:bg-surface-muted">
                  <Paperclip className="size-4" aria-hidden />
                  Fayl
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) upload.mutate(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            )}
          </section>

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
                <GradingTable detail={detail} draft={draft} setDraft={setDraft} canGrade={canGrade} onOpen={setOpenStudent} />
              </div>
            </>
          )}
        </div>
      ) : null}
      {openStudent && detail && (
        <SubmissionReviewModal homework={detail} studentId={openStudent} canGrade={canGrade} onClose={() => setOpenStudent(null)} onChanged={onChanged} />
      )}
    </Modal>
  );
}
