import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { WeeklyReportView } from '@/components/weekly/WeeklyReportView';
import { shiftWeek } from '@/components/weekly/week';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/**
 * Haftalik hisobot (TZ §11): web ko‘rinishi, hafta tanlash va PDF (brauzerda "Chop etish" →
 * "PDF sifatida saqlash"). Telegramga xuddi shu hisobot har yakshanba kechqurun yuboriladi.
 */
export default function PortalWeeklyReportPage() {
  const { activeChild } = usePortal();
  const [week, setWeek] = useState<string | undefined>(undefined);
  const query = useQuery({
    queryKey: queryKeys.portal.weeklyReport(activeChild, week ?? 'current'),
    queryFn: () => portalService.weeklyReport(activeChild, week),
  });
  const start = query.data?.week.start;

  return (
    <div>
      <PageHeader
        title="Haftalik hisobot"
        description={query.data?.week.label ?? 'Davomat, vazifalar, imtihonlar va o‘qituvchi izohlari'}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="secondary" leftIcon={<ChevronLeft className="size-4" aria-hidden />} disabled={!start} onClick={() => start && setWeek(shiftWeek(start, -1))}>
              Oldingi
            </Button>
            <Button variant="secondary" disabled={week === undefined} onClick={() => setWeek(undefined)}>
              Joriy hafta
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <Button leftIcon={<Printer className="size-4" aria-hidden />} disabled={!query.data} onClick={() => window.print()}>
              PDF / chop etish
            </Button>
          </div>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <WeeklyReportView report={query.data} />
      )}
    </div>
  );
}
