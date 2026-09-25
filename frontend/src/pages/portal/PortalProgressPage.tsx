import { useQuery } from '@tanstack/react-query';
import { MasteryView } from '@/components/mastery/MasteryView';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePortal } from '@/layouts/PortalContext';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';

/** Kabinet: mavzular bo'yicha o'zlashtirish va oylik progress (TZ §26–27) */
export default function PortalProgressPage() {
  const { activeChild } = usePortal();
  const query = useQuery({ queryKey: queryKeys.portal.mastery(activeChild), queryFn: () => portalService.mastery(activeChild) });

  return (
    <div>
      <PageHeader title="Progress" description="Har mavzu bo‘yicha qanchalik o‘zlashtirilgani — imtihon, vazifa, davomat va darslar asosida" />
      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <MasteryView mastery={query.data} history={query.data.history} />
      )}
    </div>
  );
}
