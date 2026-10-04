import { GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import type { TeachingStudentRow } from '@/types/teaching';
import { formatRelativeTime } from '@/utils/format';

/** Foiz: ≥ 80 — yaxshi, < 60 — e'tibor talab qiladi; ma'lumot yo'q — chiziqcha */
function Percent({ value }: { value: number | null }) {
  return (
    <span className={cn('tabular-nums', value === null ? 'text-fg-subtle' : value >= 80 ? 'text-success' : value >= 60 ? 'text-fg' : 'text-danger')}>
      {value === null ? '—' : `${value}%`}
    </span>
  );
}

/**
 * Guruh o'quvchilari: davomat | vazifa | imtihon | progress | xavf | oxirgi faollik (TZ §28–29).
 * Tartib backenddan — eng xavflisi tepada. Guruh sahifasi va O'qituvchi markazi shu jadvaldan foydalanadi.
 */
export function GroupStudentsTable({ students, label }: { students: TeachingStudentRow[]; label: string }) {
  if (students.length === 0) {
    return <EmptyState icon={GraduationCap} title="Guruhda o‘quvchi yo‘q" description="Faol o‘quvchilar shu yerda ko‘rinadi" />;
  }
  return (
    <TableContainer>
      <Table aria-label={label}>
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
          {students.map((student) => (
            <TR key={student.id}>
              <TD>
                <Link to={`/students/${student.id}`} className="focus-ring rounded-sm font-medium text-fg hover:underline">
                  {student.lastName} {student.firstName}
                </Link>
                <p className="font-mono text-caption text-fg-subtle">{student.code}</p>
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
                {student.riskLevel ? <StatusBadge kind="risk" status={student.riskLevel} /> : <span className="text-fg-subtle">—</span>}
                {student.reasons.length > 0 && <p className="mt-1 max-w-64 text-caption text-fg-muted">{student.reasons.slice(0, 3).join('; ')}</p>}
              </TD>
              <TD className="whitespace-nowrap">
                <span className="text-fg">{formatRelativeTime(student.lastActivityAt)}</span>
                <p className="text-caption text-fg-subtle">
                  {student.hasPortalAccount ? (student.lastLoginAt ? `Kabinet: ${formatRelativeTime(student.lastLoginAt)}` : 'Kabinetga kirmagan') : 'Kabinet ochilmagan'}
                </p>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}
