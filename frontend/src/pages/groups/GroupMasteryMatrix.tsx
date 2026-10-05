import { useQuery } from '@tanstack/react-query';
import { Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { masteryService } from '@/services/mastery.service';
import { MASTERY_STATUS_LABELS, levelFor, masteryCellClass } from '@/utils/masteryLabels';

/** O'quvchi × mavzu matritsasi — oynada ham, guruh sahifasidagi bo'limda ham */
export function GroupMasteryMatrix({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: queryKeys.mastery.group(groupId), queryFn: () => masteryService.group(groupId) });
  return query.isPending ? (
    <Skeleton className="h-48 w-full" />
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  ) : query.data.topics.length === 0 || query.data.students.length === 0 ? (
    <EmptyState icon={Target} title="Ma’lumot yo‘q" description="Kurs dasturida mavzular va guruhda faol o‘quvchilar bo‘lishi kerak" />
  ) : (
    <div className="overflow-x-auto">
      <table aria-label="Mavzular bo‘yicha o‘zlashtirish" className="w-full border-separate border-spacing-0 text-body">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium text-fg-muted">
              O‘quvchi
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium text-fg-muted">
              O‘rtacha
            </th>
            {query.data.topics.map((topic) => (
              <th key={topic.id} scope="col" className="min-w-24 px-2 py-2 text-center font-medium text-fg-muted">
                <Tooltip content={`${topic.moduleTitle} · ${topic.title}`} describe={false} wrapperClassName="block">
                  <span className="block max-w-28 truncate">{topic.title}</span>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {query.data.students.map((student) => (
            <tr key={student.id} className="border-t border-border">
              <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface px-2 py-1.5 text-left font-normal text-fg">
                {student.fullName}
              </th>
              <td className="px-2 py-1.5 text-right font-medium tabular-nums text-fg">{student.overall === null ? '—' : `${student.overall}%`}</td>
              {query.data.topics.map((topic) => {
                const cell = student.cells[topic.id]!;
                const level = levelFor(cell.score, query.data.settings.thresholds);
                return (
                  <td key={topic.id} className="px-1 py-1 text-center">
                    <span
                      className={cn('inline-block min-w-12 rounded px-1.5 py-0.5 tabular-nums', masteryCellClass(level))}
                      title={`${topic.title}: ${MASTERY_STATUS_LABELS[cell.status]}`}
                    >
                      {cell.score === null ? (cell.status === 'NOT_STARTED' ? '·' : '—') : `${cell.score}`}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-medium text-fg-muted">
              Guruh o‘rtachasi
            </th>
            <td />
            {query.data.topics.map((topic) => (
              <td key={topic.id} className="px-2 py-2 text-center text-caption text-fg-muted">
                {topic.average === null ? '—' : `${topic.average}%`}
                <span className="block">{topic.mastered} o‘zl.</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
      <p className="mt-3 text-caption text-fg-subtle">
        “·” — boshlanmagan, “—” — o‘rganilmoqda (hali imtihon/vazifa bahosi yo‘q). Ranglar: qizil — zaif, sariq — rivojlanmoqda, ko‘k — yaxshi, yashil — o‘zlashtirilgan.
      </p>
    </div>
  );
}
