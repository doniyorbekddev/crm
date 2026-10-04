import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import { CardLink, ListSkeleton } from './parts';

const LIMIT = 6;

/**
 * Ketib qolish xavfi yuqori o'quvchilar — eng past balldan boshlab.
 * Ro'yxat xodimning ko'rish doirasiga (filial, o'z guruhlari) bo'ysunadi.
 */
export function AtRiskStudents() {
  const query = useQuery({
    queryKey: queryKeys.students.atRisk(LIMIT),
    queryFn: () => studentsService.atRisk({ limit: LIMIT }),
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Xavf ostidagi o‘quvchilar</CardTitle>
        <CardLink to="/students?risk=CRITICAL" />
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton height="h-12" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ShieldAlert}
            title="Xavf ostida o‘quvchi yo‘q"
            description="Davomat, to‘lov va uy vazifasi ko‘rsatkichlari me’yorda."
          />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.map((student) => (
              <li key={student.id}>
                <Link
                  to={`/students/${student.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body font-medium text-fg">
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="truncate text-caption text-fg-muted">{student.group?.name ?? student.course.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {student.healthScore !== null && (
                      <span className="text-body text-fg-muted tabular-nums">{student.healthScore}</span>
                    )}
                    {student.riskLevel && <StatusBadge kind="risk" status={student.riskLevel} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
