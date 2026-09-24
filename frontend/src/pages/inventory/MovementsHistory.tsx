import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { inventoryService } from '@/services/inventory.service';
import type { Product } from '@/types/inventory';
import { formatDateTime, formatMoney, formatNumber } from '@/utils/format';
import { branchesService } from '@/services/branches.service';
import { STOCK_INCOMING, STOCK_MOVEMENT_LABELS, STOCK_MOVEMENT_TONES } from '@/utils/inventoryLabels';

const PAGE_SIZE = 20;

/** Ombor harakatlari tarixi — mahsulot bo'yicha yoki umumiy. */
export function MovementsHistory({ product, onClose }: { product?: Product; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE, ...(product ? { productId: product.id } : {}) };
  const query = useQuery({
    queryKey: queryKeys.inventory.movements(params),
    queryFn: () => inventoryService.movements(params),
    placeholderData: keepPreviousData,
  });

  // Ko'chirish yozuvida "qaysi filial bilan" degan savol darrov tug'iladi — shuning uchun
  // filial nomi ko'rsatiladi. Ro'yxat kichik va keshlangan, qo'shimcha yuk bermaydi.
  const branchesQuery = useQuery({ queryKey: queryKeys.branches.list, queryFn: branchesService.list, staleTime: 5 * 60_000 });
  const branchName = (id: string | null) => (id ? (branchesQuery.data ?? []).find((branch) => branch.id === id)?.name : undefined);

  return (
    <Modal
      open
      size="lg"
      title="Ombor harakatlari"
      description={product ? `${product.name} · ${product.sku}` : 'Barcha mahsulotlar bo‘yicha'}
      onClose={onClose}
      footer={<Button onClick={onClose}>Yopish</Button>}
    >
      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} title="Harakat yo‘q" description="Kirim yoki sotuv yozilganda shu yerda ko‘rinadi" />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {query.data.items.map((movement) => {
              const incoming = STOCK_INCOMING.includes(movement.type);
              return (
                <li key={movement.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                      <Badge tone={STOCK_MOVEMENT_TONES[movement.type]}>{STOCK_MOVEMENT_LABELS[movement.type]}</Badge>
                      {!product && <span className="truncate">{movement.product.name}</span>}
                      {movement.hasMoneyRecord && <Badge tone="gray">pul yozilgan</Badge>}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {formatDateTime(movement.createdAt)}
                      {movement.createdBy ? ` · ${movement.createdBy}` : ''}
                      {movement.student ? ` · ${movement.student.name}` : ''}
                      {branchName(movement.counterpartBranchId) ? ` · ${branchName(movement.counterpartBranchId)}` : ''}
                      {movement.reason ? ` · ${movement.reason}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={incoming ? 'text-sm tabular-nums text-emerald-600 dark:text-emerald-400' : 'text-sm tabular-nums text-fg'}>
                      {incoming ? '+' : '−'}
                      {formatNumber(movement.quantity)} {movement.product.unit}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      qoldiq: {formatNumber(movement.balanceAfter)}
                      {movement.totalAmount > 0 ? ` · ${formatMoney(movement.totalAmount)}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={query.data.meta.page}
            totalPages={query.data.meta.totalPages}
            total={query.data.meta.total}
            limit={query.data.meta.limit}
            onPageChange={setPage}
            disabled={query.isFetching}
          />
        </>
      )}
    </Modal>
  );
}
