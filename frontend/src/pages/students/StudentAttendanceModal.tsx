import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { studentsService } from '@/services/students.service';
import type { AttendanceStatus } from '@/types/attendance';
import type { StudentItem } from '@/types/student';
import { formatDate, formatNumber } from '@/utils/format';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_ORDER, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

const MONTH_NAMES = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Dushanbadan boshlanadigan hafta */
const WEEK_DAY_SHORT = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const DAY_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500 text-white',
  ABSENT: 'bg-red-500 text-white',
  LATE: 'bg-amber-500 text-white',
  EXCUSED: 'bg-brand-500 text-white',
};

interface StudentAttendanceModalProps {
  student: StudentItem;
  onClose: () => void;
}

export function StudentAttendanceModal({ student, onClose }: StudentAttendanceModalProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const calendarQuery = useQuery({
    queryKey: queryKeys.attendance.calendar(student.id, year, month),
    queryFn: () => attendanceService.calendar(student.id, year, month),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.students.attendance(student.id),
    queryFn: () => studentsService.attendanceHistory(student.id),
  });

  const shiftMonth = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  };

  /** Oyning birinchi kuni haftaning nechanchi kuniga to‘g‘ri kelishi (dushanba = 0) */
  const firstWeekDay = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

  return (
    <Modal
      open
      size="lg"
      title="Davomat kalendari"
      description={`${student.firstName} ${student.lastName} · ${student.code}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" aria-label="Oldingi oy" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <p className="text-sm font-medium text-fg">
            {MONTH_NAMES[month - 1]} {year}
          </p>
          <Button variant="ghost" size="icon" aria-label="Keyingi oy" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        {calendarQuery.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : calendarQuery.isError ? (
          <ErrorState error={calendarQuery.error} retrying={calendarQuery.isFetching} onRetry={() => void calendarQuery.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK_DAY_SHORT.map((day) => (
                <span key={day} className="py-1 text-[11px] font-medium text-fg-muted">
                  {day}
                </span>
              ))}
              {Array.from({ length: firstWeekDay }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {calendarQuery.data.days.map((day) => {
                const dayNumber = Number(day.date.slice(8, 10));
                return (
                  <span
                    key={day.date}
                    title={day.status ? `${formatDate(day.date)} — ${day.statusLabel}${day.note ? ` (${day.note})` : ''}` : formatDate(day.date)}
                    className={cn(
                      'grid aspect-square place-items-center rounded-lg text-xs',
                      day.status ? DAY_CLASSES[day.status] : 'bg-surface-muted text-fg-subtle',
                    )}
                  >
                    {dayNumber}
                  </span>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {ATTENDANCE_STATUS_ORDER.map((status) => (
                <Badge key={status} tone={ATTENDANCE_STATUS_TONES[status]}>
                  {ATTENDANCE_STATUS_LABELS[status]}: {formatNumber(calendarQuery.data.month_[status])}
                </Badge>
              ))}
            </div>

            <div className="grid gap-3 rounded-xl border border-border bg-surface-muted p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-fg-muted">Shu oy davomati</p>
                <p className="text-lg font-semibold text-fg">{calendarQuery.data.month_.rate}%</p>
                <p className="text-xs text-fg-muted">{formatNumber(calendarQuery.data.month_.total)} ta dars</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Umumiy davomat</p>
                <p className="text-lg font-semibold text-fg">{calendarQuery.data.overall.rate}%</p>
                <p className="text-xs text-fg-muted">{formatNumber(calendarQuery.data.overall.total)} ta dars</p>
              </div>
              <div>
                <p className="text-xs text-fg-muted">Sababsiz qoldirgan</p>
                <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                  {formatNumber(calendarQuery.data.overall.ABSENT)}
                </p>
                <p className="text-xs text-fg-muted">butun davr bo‘yicha</p>
              </div>
            </div>
          </>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-fg">So‘nggi darslar</p>
          {historyQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : historyQuery.isError ? (
            <ErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
          ) : historyQuery.data.items.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="Davomat belgilanmagan" description="Bu o‘quvchi uchun hali dars belgilanmagan" />
          ) : (
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {historyQuery.data.items.slice(0, 15).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm text-fg">{formatDate(item.date)}</p>
                    <p className="text-xs text-fg-muted">
                      {item.groupName}
                      {item.note && ` · ${item.note}`}
                    </p>
                  </div>
                  <Badge tone={ATTENDANCE_STATUS_TONES[item.status]}>{ATTENDANCE_STATUS_LABELS[item.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
