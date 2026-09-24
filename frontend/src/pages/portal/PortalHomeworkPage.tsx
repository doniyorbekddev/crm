import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { usePortal } from '@/layouts/PortalContext';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { SubmissionStatus } from '@/types/homework';
import { formatDateTime, formatRelativeTime } from '@/utils/format';
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_ORDER, SUBMISSION_STATUS_TONES } from '@/utils/homeworkLabels';

/** Kutilayotganlar yuqorida, muddati yaqini birinchi */
const STATUS_WEIGHT: Record<SubmissionStatus, number> = { PENDING: 0, LATE: 1, SUBMITTED: 2, GRADED: 3, MISSED: 4 };

/** Uy vazifalari ro‘yxati — holat filtri bilan; topshirish detal sahifasida */
export default function PortalHomeworkPage() {
  const { activeChild } = usePortal();
  const [status, setStatus] = useState<SubmissionStatus | ''>('');
  // Render vaqtida `Date.now()` chaqirilmaydi — sahifa ochilgan payt bir marta olinadi
  const [now] = useState(() => Date.now());

  const query = useQuery({
    queryKey: queryKeys.portal.homework(activeChild),
    queryFn: () => portalService.homework(activeChild),
  });

  const rows = (query.data ?? [])
    .filter((row) => !status || row.status === status)
    .sort((a, b) => STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] || a.deadline.localeCompare(b.deadline));

  return (
    <div>
      <PageHeader
        title="Uy vazifalari"
        description="Berilgan vazifalar, muddatlar va baholar"
        actions={
          <Select value={status} onChange={(event) => setStatus(event.target.value as SubmissionStatus | '')} aria-label="Holat bo‘yicha filtr">
            <option value="">Barcha holatlar</option>
            {SUBMISSION_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {SUBMISSION_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        }
      />

      <Card>
        {query.isPending ? (
          <TableSkeleton rows={5} columns={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title={status ? 'Bu holatda vazifa yo‘q' : 'Uy vazifasi yo‘q'}
            description="O‘qituvchi vazifa berganda shu yerda ko‘rinadi"
          />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const overdue = row.status === 'PENDING' && new Date(row.deadline).getTime() < now;
              return (
                <li key={row.homeworkId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link to={`/portal/homework/${row.homeworkId}`} className="block truncate font-medium text-fg hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-fg-muted">
                      {row.groupName} · muddat:{' '}
                      <span className={cn(overdue && 'text-red-600 dark:text-red-400')}>
                        {formatDateTime(row.deadline)} ({formatRelativeTime(row.deadline)})
                      </span>
                    </p>
                    {row.feedback && <p className="mt-1 text-sm text-fg-muted">Izoh: {row.feedback}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums text-fg">
                      {row.score === null ? '—' : `${row.score}/${row.maxPoints}`}
                      {row.xpAwarded > 0 && <span className="ml-1 text-xs text-fg-muted">+{row.xpAwarded} XP</span>}
                    </span>
                    <Badge tone={SUBMISSION_STATUS_TONES[row.status]}>{SUBMISSION_STATUS_LABELS[row.status]}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
