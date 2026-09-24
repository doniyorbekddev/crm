import { useQuery } from '@tanstack/react-query';
import { FileCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TableSkeleton } from '@/components/ui/Table';
import { usePortal } from '@/layouts/PortalContext';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate } from '@/utils/format';
import { GRADE_TONES } from '@/utils/homeworkLabels';

/** Imtihon natijalari. Onlayn topshirish — Assessment 2.0 bosqichida qo‘shiladi. */
export default function PortalExamsPage() {
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.exams(activeChild), queryFn: () => portalService.exams(activeChild) });

  const rows = [...(query.data ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length) : null;

  return (
    <div>
      <PageHeader
        title="Imtihonlar"
        description={average === null ? 'Natijalar kiritilganda shu yerda ko‘rinadi' : `${rows.length} ta imtihon · o‘rtacha ${average}%`}
      />

      <Card>
        {query.isPending ? (
          <TableSkeleton rows={4} columns={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={FileCheck} title="Imtihon natijasi yo‘q" description="Natija kiritilganda shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.examId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={`/portal/exams/${row.examId}`} className="block truncate font-medium text-fg hover:underline">
                    {row.title}
                  </Link>
                  <p className="text-xs text-fg-muted">
                    {row.groupName} · {formatDate(row.date)}
                    {row.xpAwarded > 0 && ` · +${row.xpAwarded} XP`}
                  </p>
                  {row.comment && <p className="mt-1 text-sm text-fg-muted">Izoh: {row.comment}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-fg">
                    {row.score}/{row.maxScore} · <b>{row.percentage}%</b>
                  </span>
                  {row.grade && <Badge tone={GRADE_TONES[row.grade] ?? 'gray'}>{row.grade}</Badge>}
                  {row.passed !== null && (
                    <span className={cn('text-xs font-medium', row.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                      {row.passed ? 'O‘tdi' : 'O‘tmadi'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
