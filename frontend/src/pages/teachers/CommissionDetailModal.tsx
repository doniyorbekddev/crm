import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { commissionService } from '@/services/commission.service';
import { CommissionEntriesTable, CommissionHistoryTable, CommissionKpis } from './commission/CommissionBlocks';

interface CommissionDetailModalProps {
  teacherProfileId: string;
  teacherName: string;
  year: number;
  month: number;
  onClose: () => void;
}

/** Owner/buxgalter: o‘qituvchi foizining to‘lovlar bo‘yicha tafsiloti va oylar tarixi */
export function CommissionDetailModal({ teacherProfileId, teacherName, year, month, onClose }: CommissionDetailModalProps) {
  const [selected, setSelected] = useState({ year, month });
  const query = useQuery({
    queryKey: queryKeys.commissions.detail(teacherProfileId, selected),
    queryFn: () => commissionService.detail(teacherProfileId, selected),
    placeholderData: keepPreviousData,
  });

  return (
    <Modal open size="lg" title="Foiz tafsiloti" description={`${teacherName} · ${query.data?.month.label ?? ''}`} onClose={onClose}>
      {query.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : query.isError ? (
        <Alert tone="error">{getErrorMessage(query.error)}</Alert>
      ) : (
        <div className={cn('space-y-5 transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <CommissionKpis month={query.data.month} compact />
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">To‘lovlar bo‘yicha yozuvlar</h3>
            <div className="rounded-xl border border-border">
              <CommissionEntriesTable entries={query.data.entries} />
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-fg">Oxirgi 6 oy</h3>
            <div className="rounded-xl border border-border">
              <CommissionHistoryTable history={query.data.history} selected={selected} onSelect={setSelected} />
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
