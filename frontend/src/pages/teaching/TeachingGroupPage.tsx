import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, GraduationCap, Target } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { teachingService } from '@/services/teaching.service';
import { formatRelativeTime } from '@/utils/format';
import { RISK_LEVEL_LABELS, RISK_LEVEL_TONES } from '@/utils/studentLabels';
import { GroupMasteryModal } from '@/pages/groups/GroupMasteryModal';

function Percent({ value }: { value: number | null }) {
  return (
    <span className={cn('tabular-nums', value === null ? 'text-fg-subtle' : value >= 80 ? 'text-emerald-600 dark:text-emerald-400' : value >= 60 ? 'text-fg' : 'text-red-600 dark:text-red-400')}>
      {value === null ? '—' : `${value}%`}
    </span>
  );
}

/**
 * Guruh jadvali (TZ §28–29): o'quvchi | davomat | vazifa | imtihon | progress | risk | oxirgi faollik.
 * Eng xavflisi tepada; risk sabablari (§29) qatorning o'zida.
 */
export default function TeachingGroupPage() {
  const { id = '' } = useParams();
  const [masteryOpen, setMasteryOpen] = useState(false);
  const query = useQuery({ queryKey: queryKeys.teaching.group(id), queryFn: () => teachingService.group(id) });

  return (
    <div>
      <Link to="/teaching" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> O‘qituvchi markazi
      </Link>
      {query.isPending ? (
        <TableSkeleton rows={6} columns={7} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <PageHeader
            title={query.data.group.name}
            description={`${query.data.group.course.name} · ${query.data.group.students} o‘quvchi`}
            actions={
              <Button variant="secondary" leftIcon={<Target className="size-4" aria-hidden />} onClick={() => setMasteryOpen(true)}>
                Mavzular bo‘yicha
              </Button>
            }
          />
          <Card>
            {query.data.students.length === 0 ? (
              <EmptyState icon={GraduationCap} title="Guruhda o‘quvchi yo‘q" description="Faol o‘quvchilar shu yerda ko‘rinadi" />
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <tr>
                      <TH>O‘quvchi</TH>
                      <TH className="text-right">Davomat</TH>
                      <TH className="text-right">Vazifa</TH>
                      <TH className="text-right">Imtihon</TH>
                      <TH className="text-right">Progress</TH>
                      <TH>Risk</TH>
                      <TH>Oxirgi faollik</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {query.data.students.map((student) => (
                      <TR key={student.id}>
                        <TD>
                          <Link to={`/students/${student.id}`} className="font-medium text-fg hover:underline">
                            {student.lastName} {student.firstName}
                          </Link>
                          <p className="text-xs text-fg-subtle">{student.code}</p>
                        </TD>
                        <TD className="text-right">
                          <Percent value={student.attendanceRate} />
                        </TD>
                        <TD className="text-right">
                          <Percent value={student.homeworkRate} />
                        </TD>
                        <TD className="text-right">
                          <Percent value={student.examAverage} />
                        </TD>
                        <TD className="text-right">
                          <Percent value={student.progress} />
                        </TD>
                        <TD>
                          {student.riskLevel ? <Badge tone={RISK_LEVEL_TONES[student.riskLevel]}>{RISK_LEVEL_LABELS[student.riskLevel]}</Badge> : <span className="text-fg-subtle">—</span>}
                          {student.reasons.length > 0 && <p className="mt-1 max-w-64 text-xs text-fg-muted">{student.reasons.slice(0, 3).join('; ')}</p>}
                        </TD>
                        <TD className="whitespace-nowrap text-sm">
                          <span className="text-fg">{formatRelativeTime(student.lastActivityAt)}</span>
                          <p className="text-xs text-fg-subtle">
                            {student.hasPortalAccount ? (student.lastLoginAt ? `Kabinet: ${formatRelativeTime(student.lastLoginAt)}` : 'Kabinetga kirmagan') : 'Kabinet ochilmagan'}
                          </p>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
          </Card>
          {masteryOpen && <GroupMasteryModal group={{ id: query.data.group.id, name: query.data.group.name }} onClose={() => setMasteryOpen(false)} />}
        </>
      )}
    </div>
  );
}
