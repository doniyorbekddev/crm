import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, Paperclip, Save, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MaterialList } from '@/components/lesson/LessonBody';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { usePortal } from '@/layouts/PortalContext';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { HomeworkSubmitPayload, PortalHomeworkDetail } from '@/types/portal';
import { formatDateTime, formatRelativeTime } from '@/utils/format';
import { DIFFICULTY_LABELS, DIFFICULTY_TONES, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';
import { formatFileSize } from '@/utils/lessonLabels';

const ACCEPTED_TYPES = 'application/pdf,image/png,image/jpeg,image/webp';
const MAX_ANSWER = 2000;
const CODE_LANGUAGES = ['', 'html', 'css', 'javascript', 'typescript', 'python', 'java', 'cpp', 'sql', 'boshqa'] as const;

interface Draft {
  answerText: string;
  linkUrl: string;
  codeText: string;
  codeLanguage: string;
}

function draftFrom(detail: PortalHomeworkDetail | undefined): Draft {
  return {
    answerText: detail?.submission.answerText ?? '',
    linkUrl: detail?.submission.linkUrl ?? '',
    codeText: detail?.submission.codeText ?? '',
    codeLanguage: detail?.submission.codeLanguage ?? '',
  };
}

/** Faqat to‘ldirilgan maydonlar yuboriladi */
function payloadOf(draft: Draft): HomeworkSubmitPayload {
  return {
    ...(draft.answerText.trim() ? { answerText: draft.answerText.trim() } : {}),
    ...(draft.linkUrl.trim() ? { linkUrl: draft.linkUrl.trim() } : {}),
    ...(draft.codeText.trim() ? { codeText: draft.codeText } : {}),
    ...(draft.codeLanguage ? { codeLanguage: draft.codeLanguage } : {}),
  };
}

/**
 * Bitta vazifa (TZ §15–19): tavsif, o‘qituvchi fayllari, o‘z topshirig‘i va izohi.
 * Javob: matn, havola, kod va bir nechta fayl (PDF/rasm). "Qoralamani saqlash" — topshirmasdan
 * (holat "Bajarilmoqda"), "Topshirish" — o‘qituvchiga yuboradi. Qaytarilgan ishni qayta topshirish mumkin.
 */
export default function PortalHomeworkDetailPage() {
  const { id = '' } = useParams();
  const { me, activeChild } = usePortal();
  const queryClient = useQueryClient();
  const [changes, setChanges] = useState<Partial<Draft>>({});

  const query = useQuery({
    queryKey: queryKeys.portal.homeworkDetail(activeChild, id),
    queryFn: () => portalService.homeworkDetail(id, activeChild),
  });
  // Server qiymati ustiga faqat o‘zgartirilganlar — qayta yuklashda forma eskirmaydi
  const draft: Draft = { ...draftFrom(query.data), ...changes };
  const set = (patch: Partial<Draft>) => setChanges((current) => ({ ...current, ...patch }));

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.portal.all });
  const onError = (error: unknown) => toast.error(getErrorMessage(error));

  const submit = useMutation({
    mutationFn: () => portalService.submitHomework(id, payloadOf(draft), activeChild),
    onSuccess: () => {
      toast.success('Vazifa topshirildi');
      setChanges({});
      refresh();
    },
    onError,
  });

  const saveDraft = useMutation({
    mutationFn: () => portalService.saveHomeworkDraft(id, payloadOf(draft), activeChild),
    onSuccess: (result) => {
      toast.success(result.message);
      setChanges({});
      refresh();
    },
    onError,
  });

  const addFile = useMutation({
    mutationFn: (file: File) => portalService.addHomeworkFile(id, file, activeChild),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError,
  });

  const removeFile = useMutation({
    mutationFn: (fileId: string) => portalService.removeHomeworkFile(id, fileId, activeChild),
    onSuccess: (message) => {
      toast.success(message);
      refresh();
    },
    onError,
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const { homework, submission, canSubmit, isLate, attachments, rubric, maxFiles } = query.data;
  const isStudent = me.kind === 'STUDENT';
  const answered = ['SUBMITTED', 'LATE', 'GRADED'].includes(submission.status);
  const hasContent = Boolean(draft.answerText.trim() || draft.linkUrl.trim() || draft.codeText.trim()) || submission.files.length > 0;
  const busy = submit.isPending || saveDraft.isPending;

  return (
    <div>
      <Link to="/portal/homework" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden />
        Barcha vazifalar
      </Link>
      <PageHeader
        title={homework.title}
        description={`${homework.groupName}${homework.teacherName ? ` · ${homework.teacherName}` : ''} · muddat: ${formatDateTime(homework.deadline)} (${formatRelativeTime(homework.deadline)})`}
        actions={<Badge tone={SUBMISSION_STATUS_TONES[submission.status]}>{SUBMISSION_STATUS_LABELS[submission.status]}</Badge>}
      />

      {submission.status === 'RETURNED' && submission.feedback && (
        <Alert tone="warning" className="mb-4" title="O‘qituvchi qayta ishlashni so‘radi">
          {submission.feedback}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Topshiriq</CardTitle>
                <CardDescription>
                  Maksimal {homework.maxPoints} ball · +{homework.xpReward} XP
                </CardDescription>
              </div>
              {homework.difficulty && <Badge tone={DIFFICULTY_TONES[homework.difficulty]}>{DIFFICULTY_LABELS[homework.difficulty]}</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap text-fg">{homework.description ?? 'Tavsif berilmagan.'}</p>
              {(homework.topic || homework.lesson) && (
                <p className="text-xs text-fg-muted">
                  {homework.topic && `Mavzu: ${homework.topic.title}`}
                  {homework.lesson && (
                    <>
                      {' · '}
                      <Link to={`/portal/course/lessons/${homework.lesson.id}`} className="text-brand-600 hover:underline dark:text-brand-300">
                        Dars: {homework.lesson.title}
                      </Link>
                    </>
                  )}
                </p>
              )}
              {attachments.length > 0 && (
                <MaterialList
                  materials={attachments.map((item, index) => ({ ...item, sortOrder: index }))}
                  onDownload={(item) => void portalService.downloadHomeworkMaterial(id, attachments.find((a) => a.id === item.id)!, activeChild).catch(onError)}
                />
              )}
            </CardContent>
          </Card>

          {(answered || submission.feedback || submission.files.length > 0) && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Mening topshirig‘im</CardTitle>
                  {submission.submittedAt && <CardDescription>Topshirilgan: {formatDateTime(submission.submittedAt)}</CardDescription>}
                </div>
                {submission.score !== null && (
                  <span className="text-lg font-semibold tabular-nums text-fg">
                    {submission.score}/{homework.maxPoints}
                    {submission.xpAwarded > 0 && <span className="ml-1 text-xs font-normal text-fg-muted">+{submission.xpAwarded} XP</span>}
                  </span>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {!canSubmit && submission.answerText && <p className="text-sm whitespace-pre-wrap text-fg">{submission.answerText}</p>}
                {!canSubmit && submission.linkUrl && (
                  <a href={submission.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-300">
                    <ExternalLink className="size-4" aria-hidden />
                    {submission.linkUrl}
                  </a>
                )}
                {!canSubmit && submission.codeText && (
                  <pre className="max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    <code>{submission.codeText}</code>
                  </pre>
                )}
                {submission.files.length > 0 && (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {submission.files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-fg">{file.originalName}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void portalService.downloadHomeworkFile(id, file, activeChild).catch(onError)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-surface-muted dark:text-brand-300"
                          >
                            <Download className="size-3.5" aria-hidden />
                            {file.size > 0 ? formatFileSize(file.size) : 'Ochish'}
                          </button>
                          {canSubmit && isStudent && (
                            <button
                              type="button"
                              aria-label={`${file.originalName} — o‘chirish`}
                              onClick={() => removeFile.mutate(file.id)}
                              className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {rubric?.scores && (
                  <ul className="space-y-1 text-sm">
                    {rubric.criteria.map((criterion) => (
                      <li key={criterion.key} className="flex justify-between gap-2">
                        <span className="text-fg-muted">
                          {criterion.title} ({criterion.weight}%)
                        </span>
                        <span className="tabular-nums text-fg">{rubric.scores?.[criterion.key] ?? '—'}%</span>
                      </li>
                    ))}
                  </ul>
                )}
                {submission.feedback && submission.status !== 'RETURNED' && (
                  <Alert tone="info">
                    <b>O‘qituvchi izohi:</b> {submission.feedback}
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{answered ? 'Javobni yangilash' : 'Topshirish'}</CardTitle>
              <CardDescription>Matn, havola, kod yoki fayl (PDF, PNG, JPG, WEBP)</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!canSubmit ? (
              <Alert tone="info">{submission.status === 'GRADED' ? 'Vazifa baholangan — qayta topshirib bo‘lmaydi.' : 'Bu vazifa yopilgan.'}</Alert>
            ) : !isStudent ? (
              <Alert tone="info">Vazifani farzandingiz o‘zi topshiradi — bu yerda holati va natijasini kuzatasiz.</Alert>
            ) : (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  submit.mutate();
                }}
              >
                {isLate && submission.status !== 'RETURNED' && <Alert tone="warning">Muddat o‘tgan — topshiriq “kechikdi” deb belgilanadi.</Alert>}
                <FormField label="Javob matni" htmlFor="answerText" hint={`${draft.answerText.length}/${MAX_ANSWER}`}>
                  <Textarea
                    id="answerText"
                    value={draft.answerText}
                    maxLength={MAX_ANSWER}
                    onChange={(event) => set({ answerText: event.target.value })}
                    placeholder="Javobingizni shu yerga yozing…"
                    rows={5}
                  />
                </FormField>
                <FormField label="Havola" htmlFor="linkUrl" hint="GitHub, CodePen, Figma…">
                  <Input id="linkUrl" type="url" placeholder="https://…" value={draft.linkUrl} onChange={(event) => set({ linkUrl: event.target.value })} />
                </FormField>
                <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                  <FormField label="Kod" htmlFor="codeText">
                    <Textarea id="codeText" rows={5} className="font-mono text-xs" spellCheck={false} value={draft.codeText} onChange={(event) => set({ codeText: event.target.value })} />
                  </FormField>
                  <FormField label="Til" htmlFor="codeLanguage">
                    <Select id="codeLanguage" value={draft.codeLanguage} onChange={(event) => set({ codeLanguage: event.target.value })}>
                      {CODE_LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language || '—'}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <FormField label={`Fayllar (${submission.files.length}/${maxFiles})`} htmlFor="attachment">
                  <label
                    htmlFor="attachment"
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-muted"
                  >
                    <Paperclip className="size-4" aria-hidden />
                    {addFile.isPending ? 'Yuklanmoqda…' : 'Fayl qo‘shish'}
                    <input
                      id="attachment"
                      type="file"
                      accept={ACCEPTED_TYPES}
                      className="sr-only"
                      disabled={addFile.isPending || submission.files.length >= maxFiles}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) addFile.mutate(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </FormField>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary" leftIcon={<Save className="size-4" aria-hidden />} loading={saveDraft.isPending} disabled={busy} onClick={() => saveDraft.mutate()}>
                    Qoralamani saqlash
                  </Button>
                  <Button type="submit" leftIcon={<Send className="size-4" aria-hidden />} loading={submit.isPending} disabled={!hasContent || busy}>
                    Topshirish
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
