import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { AttendanceCalendarView, MonthSwitcher } from '@/components/AttendanceCalendarView';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { attendanceService } from '@/services/attendance.service';
import { studentsService } from '@/services/students.service';
import type { StudentItem } from '@/types/student';
import { formatDate } from '@/utils/format';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_TONES } from '@/utils/studentLabels';

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
        <MonthSwitcher year={year} month={month} onShift={shiftMonth} />

        {calendarQuery.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : calendarQuery.isError ? (
          <ErrorState error={calendarQuery.error} retrying={calendarQuery.isFetching} onRetry={() => void calendarQuery.refetch()} />
        ) : (
          <div className="space-y-4">
            <AttendanceCalendarView calendar={calendarQuery.data} />
          </div>
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
