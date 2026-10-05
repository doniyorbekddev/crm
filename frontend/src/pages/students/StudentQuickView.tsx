import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Drawer } from '@/components/ui/Drawer';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { StudentItem } from '@/types/student';
import { formatDate, formatMoney, formatPhone } from '@/utils/format';
import { AttendancePanel } from './profile/AttendancePanel';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-body break-words text-fg">{children}</dd>
    </div>
  );
}

/**
 * O'quvchini ro'yxatdan chiqmasdan ko'rish: aloqa, kurs, shartnoma va qarz (ro'yxat qatoridan);
 * davomat — ruxsat bo'lsa. Amallar — to'liq profilda.
 */
export function StudentQuickView({ student, showAttendance, onClose }: { student: StudentItem; showAttendance: boolean; onClose: () => void }) {
  const remaining = student.debt?.remaining ?? 0;
  return (
    <Drawer
      open
      title={`${student.firstName} ${student.lastName}`}
      description={student.code}
      onClose={onClose}
      footer={
        <Link
          to={`/students/${student.id}`}
          className="focus-ring inline-flex h-9 items-center justify-center rounded-control border border-border bg-surface px-3.5 text-body font-medium text-fg shadow-sm transition-colors hover:bg-surface-muted"
        >
          To‘liq profilni ochish
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="student" status={student.status} />
        {student.riskLevel && <StatusBadge kind="risk" status={student.riskLevel} />}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Telefon">
          <a href={`tel:${student.phone}`} className="focus-ring rounded-chip hover:text-primary hover:underline">
            {formatPhone(student.phone)}
          </a>
        </Field>
        <Field label="Ota-ona telefoni">{student.parentPhone ? formatPhone(student.parentPhone) : '—'}</Field>
        <Field label="Kurs">{student.course.name}</Field>
        <Field label="Guruh">{student.group?.name ?? 'Guruhsiz'}</Field>
        <Field label="Shartnoma narxi">{formatMoney(student.contractPrice)}</Field>
        <Field label="Qarz">
          <span className={remaining > 0 ? 'font-medium text-danger' : undefined}>{student.debt ? formatMoney(remaining) : '—'}</span>
        </Field>
        <Field label="O‘qish boshlangan">{formatDate(student.startDate)}</Field>
        <Field label="Kabinet">{student.hasPortalAccount ? 'Ochilgan' : 'Ochilmagan'}</Field>
      </dl>

      {showAttendance && (
        <>
          <h3 className="mt-5 mb-3 text-h4 text-fg">Davomat</h3>
          <AttendancePanel studentId={student.id} />
        </>
      )}
    </Drawer>
  );
}
