import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Paperclip, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { usePortal } from '@/layouts/PortalContext';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDateTime, formatRelativeTime } from '@/utils/format';
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';

const ACCEPTED_TYPES = 'application/pdf,image/png,image/jpeg,image/webp';
const MAX_ANSWER = 2000;

/**
 * Bitta vazifa: tavsif, muddat, o‘z topshirig‘i va o‘qituvchi izohi; topshirish formasi.
 *
 * Matn va fayl **alohida** so‘rov (backend shunday) — ikkalasi to‘ldirilsa ketma-ket yuboriladi.
 * Baholangan vazifani qayta topshirib bo‘lmaydi (backend rad etadi, forma yashiriladi).
 */
export default function PortalHomeworkDetailPage() {
  const { id = '' } = useParams();
  const { activeChild } = usePortal();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const query = useQuery({
    queryKey: queryKeys.portal.homeworkDetail(activeChild, id),
    queryFn: () => portalService.homeworkDetail(id, activeChild),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const text = answer.trim();
      if (!text && !file) throw new Error('Javob matnini yozing yoki fayl tanlang');
      if (text) await portalService.submitHomework(id, { answerText: text }, activeChild);
      if (file) await portalService.submitHomeworkAttachment(id, file, activeChild);
    },
    onSuccess: () => {
      toast.success('Vazifa topshirildi');
      setAnswer('');
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const download = useMutation({
    mutationFn: () => portalService.downloadHomeworkAttachment(id, query.data?.homework.title ?? 'vazifa', activeChild),
    onError: (error) => toast.error(getErrorMessage(error)),
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

  const { homework, submission, canSubmit, isLate } = query.data;
  const answered = submission.status !== 'PENDING' && submission.status !== 'MISSED';

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
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-fg">{homework.description ?? 'Tavsif berilmagan.'}</p>
            </CardContent>
          </Card>

          {(answered || submission.feedback) && (
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
                {submission.answerText && <p className="text-sm whitespace-pre-wrap text-fg">{submission.answerText}</p>}
                {submission.hasAttachment && (
                  <Button variant="secondary" size="sm" onClick={() => download.mutate()} loading={download.isPending}>
                    <Download className="size-4" aria-hidden />
                    Yuklangan faylni ochish
                  </Button>
                )}
                {submission.feedback && (
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
              <CardTitle>{answered ? 'Qayta topshirish' : 'Topshirish'}</CardTitle>
              <CardDescription>Matn yozing yoki fayl (PDF, PNG, JPG, WEBP) yuklang</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {!canSubmit ? (
              <Alert tone="info">
                {submission.status === 'GRADED' ? 'Vazifa baholangan — qayta topshirib bo‘lmaydi.' : 'Bu vazifa yopilgan.'}
              </Alert>
            ) : (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  submit.mutate();
                }}
              >
                {isLate && <Alert tone="warning">Muddat o‘tgan — topshiriq “kechikdi” deb belgilanadi.</Alert>}
                <FormField label="Javob matni" htmlFor="answerText" hint={`${answer.length}/${MAX_ANSWER}`}>
                  <Textarea
                    id="answerText"
                    value={answer}
                    maxLength={MAX_ANSWER}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Javobingizni shu yerga yozing…"
                    rows={6}
                  />
                </FormField>
                <FormField label="Fayl" htmlFor="attachment" hint={file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : 'ixtiyoriy'}>
                  <label
                    htmlFor="attachment"
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-fg-muted hover:bg-surface-muted"
                  >
                    <Paperclip className="size-4" aria-hidden />
                    {file ? 'Boshqa fayl tanlash' : 'Fayl tanlash'}
                    <input
                      id="attachment"
                      type="file"
                      accept={ACCEPTED_TYPES}
                      className="sr-only"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </FormField>
                <div className="flex justify-end">
                  <Button type="submit" loading={submit.isPending} disabled={!answer.trim() && !file}>
                    <Send className="size-4" aria-hidden />
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
