import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import { WeeklyReportView } from './WeeklyReportView';
import { shiftWeek } from './week';

/** Xodim uchun: o‘quvchi profilidan haftalik hisobot (o‘qituvchi — faqat o‘z guruhi, backendda) */
export function WeeklyReportModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const [week, setWeek] = useState<string | undefined>(undefined);
  const query = useQuery({
    queryKey: queryKeys.students.weeklyReport(studentId, week ?? 'current'),
    queryFn: () => studentsService.weeklyReport(studentId, week),
  });
  const start = query.data?.week.start;

  return (
    <Modal
      open
      size="lg"
      title="Haftalik hisobot"
      description={query.data?.week.label}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Yopish
        </Button>
      }
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" leftIcon={<ChevronLeft className="size-4" aria-hidden />} disabled={!start} onClick={() => start && setWeek(shiftWeek(start, -1))}>
          Oldingi hafta
        </Button>
        <Button variant="ghost" size="sm" disabled={!start || week === undefined} onClick={() => setWeek(undefined)}>
          Joriy hafta
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <WeeklyReportView report={query.data} />
      )}
    </Modal>
  );
}
