import { useQuery } from '@tanstack/react-query';
import { MasteryView } from '@/components/mastery/MasteryView';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { masteryService } from '@/services/mastery.service';

/** Xodim: o'quvchining mavzular bo'yicha o'zlashtirishi va oylik tarixi */
export function MasteryTab({ studentId }: { studentId: string }) {
  const mastery = useQuery({ queryKey: queryKeys.mastery.student(studentId), queryFn: () => masteryService.student(studentId) });
  const history = useQuery({ queryKey: queryKeys.mastery.history(studentId), queryFn: () => masteryService.history(studentId) });

  if (mastery.isPending) return <Skeleton className="h-64 w-full" />;
  if (mastery.isError) return <ErrorState error={mastery.error} onRetry={() => void mastery.refetch()} />;
  return <MasteryView mastery={mastery.data} history={history.data ?? []} />;
}
