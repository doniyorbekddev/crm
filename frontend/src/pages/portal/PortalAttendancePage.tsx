import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { AttendanceCalendarView, MonthSwitcher } from '@/components/AttendanceCalendarView';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/** Oylik davomat kalendari — xodim ko‘radigan bilan bir xil ko‘rinish */
export default function PortalAttendancePage() {
  const { activeChild } = usePortal();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const query = useQuery({
    queryKey: queryKeys.portal.attendance(activeChild, year, month),
    queryFn: () => portalService.attendanceCalendar(year, month, activeChild),
  });

  const shiftMonth = (delta: number) => {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  };

  return (
    <div>
      <PageHeader title="Davomat" description="Har bir dars kuni bo‘yicha holat" />
      <Card>
        <CardContent className="space-y-4">
          <MonthSwitcher year={year} month={month} onShift={shiftMonth} />
          {query.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : query.isError ? (
            <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
          ) : (
            <AttendanceCalendarView calendar={query.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
