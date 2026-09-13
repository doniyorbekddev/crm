import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { UserCog } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorStatus } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { commissionService } from '@/services/commission.service';
import { CommissionEntriesTable, CommissionHistoryTable, CommissionKpis, MonthSelect } from './commission/CommissionBlocks';

const today = new Date();

/** O‘qituvchi: o‘z o‘quvchilaridan tushgan to‘lovlar, foiz va maosh holati */
export default function MyEarningsPage() {
  const [selected, setSelected] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  const query = useQuery({
    queryKey: queryKeys.commissions.mine(selected),
    queryFn: () => commissionService.mine(selected),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Mening daromadim"
        description="O‘quvchilaringizdan real tushgan to‘lovlar va foizingiz"
        documentTitle="Mening daromadim"
        actions={<MonthSelect year={selected.year} month={selected.month} onChange={setSelected} />}
      />

      {query.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        getErrorStatus(query.error) === 404 ? (
          <Card>
            <EmptyState icon={UserCog} title="O‘qituvchi profili yo‘q" description="Profil ochilgandan keyin daromadingiz shu yerda ko‘rinadi" />
          </Card>
        ) : (
          <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
        )
      ) : (
        <div className={cn('space-y-4 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <CommissionKpis month={query.data.month} />

          <Card>
            <CardHeader>
              <CardTitle>{query.data.month.label}: to‘lovlar va foiz</CardTitle>
            </CardHeader>
            <CommissionEntriesTable entries={query.data.entries} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Oxirgi 6 oy</CardTitle>
            </CardHeader>
            <CommissionHistoryTable history={query.data.history} selected={selected} onSelect={setSelected} />
          </Card>
        </div>
      )}
    </>
  );
}
