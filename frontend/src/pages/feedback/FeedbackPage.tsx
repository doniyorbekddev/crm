import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareHeart, Star } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { feedbackService } from '@/services/feedback.service';
import type { FeedbackType } from '@/types/feedback';
import { formatDateTime, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<FeedbackType, string> = {
  TEACHER: 'O‘qituvchi',
  COURSE: 'Kurs',
  ACADEMY: 'Markaz',
  NPS: 'Tavsiya (NPS)',
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} yulduz`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn('size-3.5', star <= value ? 'fill-amber-400 text-amber-400' : 'text-border')}
          aria-hidden
        />
      ))}
    </span>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-fg',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </Card>
  );
}

/**
 * O'quvchilar fikri va NPS. Past baho bilan kelgan fikr "ochiq" bo'lib turadi —
 * xodim u bilan ishlaganini izoh bilan belgilaydi.
 */
export default function FeedbackPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.FEEDBACK_MANAGE);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<'' | FeedbackType>('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [handleId, setHandleId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(type ? { type } : {}),
    ...(onlyOpen ? { onlyOpen: 'true' as const } : {}),
  };
  const listQuery = useQuery({
    queryKey: queryKeys.feedback.list(params),
    queryFn: () => feedbackService.list(params),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({ queryKey: queryKeys.feedback.stats({}), queryFn: () => feedbackService.stats() });

  const handle = useMutation({
    mutationFn: () => feedbackService.handle(handleId!, note.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      setHandleId(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const stats = statsQuery.data;
  const maxRating = Math.max(1, ...(stats?.ratingDistribution ?? []).map((row) => row.count));

  return (
    <>
      <PageHeader title="Fikr-mulohaza" description="O‘quvchilar bahosi, NPS va salbiy fikrlar bilan ishlash" />

      {statsQuery.isPending ? (
        <Skeleton className="mb-6 h-24 w-full rounded-xl" />
      ) : statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => void statsQuery.refetch()} />
      ) : stats ? (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="NPS"
              value={stats.nps === null ? '—' : String(stats.nps)}
              hint={stats.npsResponses > 0 ? `${stats.promoters} tarafdor · ${stats.detractors} tanqidchi` : 'Javob yo‘q'}
              tone={stats.nps === null ? undefined : stats.nps >= 30 ? 'good' : stats.nps < 0 ? 'bad' : undefined}
            />
            <StatCard
              label="O‘qituvchi bahosi"
              value={stats.teacherAverage === null ? '—' : `${stats.teacherAverage} / 5`}
            />
            <StatCard label="Kurs bahosi" value={stats.courseAverage === null ? '—' : `${stats.courseAverage} / 5`} />
            <StatCard
              label="Ochiq salbiy fikr"
              value={formatNumber(stats.openNegative)}
              hint={stats.openNegative > 0 ? 'Ishlanishi kerak' : 'Hammasi ishlangan'}
              tone={stats.openNegative > 0 ? 'bad' : 'good'}
            />
          </div>

          {stats.total > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Baholar taqsimoti</CardTitle>
                <span className="text-xs text-fg-muted">{formatNumber(stats.total)} ta fikr</span>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {[...stats.ratingDistribution].reverse().map((row) => (
                    <li key={row.rating} className="flex items-center gap-3 text-xs">
                      <span className="w-14 shrink-0 text-fg-muted">{row.rating} yulduz</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={cn('h-full rounded-full', row.rating >= 4 ? 'bg-emerald-500' : row.rating === 3 ? 'bg-amber-500' : 'bg-red-500')}
                          style={{ width: `${Math.round((row.count / maxRating) * 100)}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums text-fg-muted">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as '' | FeedbackType);
              setPage(1);
            }}
            aria-label="Fikr turi"
            wrapperClassName="w-52"
          >
            <option value="">Barcha turlar</option>
            {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((key) => (
              <option key={key} value={key}>
                {TYPE_LABELS[key]}
              </option>
            ))}
          </Select>
          <Button
            variant={onlyOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setOnlyOpen((current) => !current);
              setPage(1);
            }}
          >
            Faqat ochiq salbiylar
          </Button>
        </div>

        {listQuery.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={MessageSquareHeart}
            title="Fikr yo‘q"
            description="O‘quvchilar kabinetdan baho qoldirganda shu yerda ko‘rinadi"
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {listQuery.data.items.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="gray">{TYPE_LABELS[item.type]}</Badge>
                    {item.rating !== null && <Stars value={item.rating} />}
                    {item.npsScore !== null && <span className="text-sm tabular-nums text-fg">{item.npsScore} / 10</span>}
                    {item.isNegative && !item.handledAt && <Badge tone="red">Ishlanmagan</Badge>}
                    {item.handledAt && <Badge tone="green">Ishlangan</Badge>}
                    <span className="ml-auto text-xs text-fg-subtle">{formatDateTime(item.createdAt)}</span>
                  </div>

                  {item.comment && <p className="mt-1.5 text-sm text-fg">{item.comment}</p>}

                  <p className="mt-1 text-xs text-fg-subtle">
                    {item.student ? (
                      <Link to={`/students/${item.student.id}`} className="hover:text-brand-600 hover:underline">
                        {item.student.name}
                      </Link>
                    ) : (
                      'Anonim'
                    )}
                    {item.teacher && ` · o‘qituvchi: ${item.teacher.name}`}
                    {item.group && ` · ${item.group.name}`}
                  </p>

                  {item.handledAt ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {item.handledBy} — {item.handleNote}
                    </p>
                  ) : (
                    canManage &&
                    item.isNegative && (
                      <Button size="sm" variant="secondary" className="mt-2" onClick={() => setHandleId(item.id)}>
                        Ishlandi deb belgilash
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              page={listQuery.data.meta.page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={listQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={listQuery.isFetching}
            />
          </>
        )}
      </Card>

      {handleId && (
        <Modal
          open
          title="Fikr bo‘yicha ish"
          description="Nima qilindi? Bu izoh fikr yonida qoladi."
          onClose={() => setHandleId(null)}
          closeDisabled={handle.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={handle.isPending} onClick={() => setHandleId(null)}>
                Bekor qilish
              </Button>
              <Button disabled={note.trim().length < 3} loading={handle.isPending} onClick={() => handle.mutate()}>
                Saqlash
              </Button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Izoh</span>
            <Input value={note} placeholder="Masalan: o‘quvchi bilan gaplashildi, guruh almashtirildi" onChange={(event) => setNote(event.target.value)} />
          </label>
        </Modal>
      )}
    </>
  );
}
