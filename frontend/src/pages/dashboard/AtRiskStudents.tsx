import { useQuery } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import { RISK_LEVEL_LABELS, RISK_LEVEL_TONES } from '@/utils/studentLabels';

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
    <Card>
      <CardHeader>
        <CardTitle>Xavf ostidagi o‘quvchilar</CardTitle>
        <Link to="/students?risk=CRITICAL" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          Barchasi
        </Link>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState
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
                  className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {student.firstName} {student.lastName}
                    </p>
                    <p className="truncate text-xs text-fg-muted">{student.group?.name ?? student.course.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {student.healthScore !== null && (
                      <span className="text-sm tabular-nums text-fg-muted">{student.healthScore}</span>
                    )}
                    {student.riskLevel && (
                      <Badge tone={RISK_LEVEL_TONES[student.riskLevel]}>{RISK_LEVEL_LABELS[student.riskLevel]}</Badge>
                    )}
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
