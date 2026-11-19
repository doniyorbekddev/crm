import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { groupsService } from '@/services/groups.service';
import { formatDate } from '@/utils/format';

const fullName = (person: { firstName: string; lastName: string } | null) => (person ? `${person.firstName} ${person.lastName}` : null);

/**
 * Guruh o'qituvchilari tarixi: kim qaysi davrda dars bergan (yangisi yuqorida). Tarix 2026-yil noyabrdan
 * yuritiladi — undan oldingi almashinuvlar saqlanmagan, birinchi qator o'sha paytdagi o'qituvchi.
 */
export function GroupTeacherHistoryCard({ groupId }: { groupId: string }) {
  const query = useQuery({ queryKey: ['groups', 'teacher-history', groupId], queryFn: () => groupsService.teacherHistory(groupId) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>O‘qituvchilar tarixi</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={History} title="Tarix yo‘q" description="Guruhga hali o‘qituvchi biriktirilmagan" />
        ) : (
          <ol className="space-y-3">
            {query.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border p-3">
                <div className="min-w-0">
                  <p className="text-body font-medium text-fg">{fullName(row.teacher) ?? 'O‘qituvchi o‘chirilgan'}</p>
                  <p className="text-caption text-fg-muted tabular-nums">
                    {formatDate(row.startedAt)} — {row.endedAt ? formatDate(row.endedAt) : 'hozir'}
                    {row.changedBy && ` · biriktirgan: ${fullName(row.changedBy)}`}
                  </p>
                </div>
                {!row.endedAt && <Badge tone="success">Hozirgi</Badge>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
