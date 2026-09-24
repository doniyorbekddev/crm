import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, Package, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { inventoryService } from '@/services/inventory.service';
import type { Product } from '@/types/inventory';
import { formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { MovementModal } from './MovementModal';
import { MovementsHistory } from './MovementsHistory';
import { ProductFormModal } from './ProductFormModal';

const PAGE_SIZE = 20;

type Dialog = { type: 'product'; product?: Product } | { type: 'move'; product: Product } | { type: 'history'; product?: Product } | null;

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Package; label: string; value: string; tone?: 'bad' }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-fg-muted">{label}</p>
          <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{value}</p>
        </div>
        <Icon className="size-5 shrink-0 text-fg-subtle" aria-hidden />
      </div>
    </Card>
  );
}

/**
 * Ombor: mahsulotlar, qoldiq va harakatlar. Qoldiq faqat harakat orqali o'zgaradi —
 * shuning uchun har bir o'zgarish sababi bilan tarixda qoladi.
 */
export default function InventoryPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.INVENTORY_MANAGE);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [categoryId, setCategoryId] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(onlyLowStock ? { onlyLowStock: 'true' as const } : {}),
  };
  const listQuery = useQuery({
    queryKey: queryKeys.inventory.list(params),
    queryFn: () => inventoryService.list(params),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({ queryKey: queryKeys.inventory.stats, queryFn: inventoryService.stats });
  const categoriesQuery = useQuery({ queryKey: queryKeys.inventory.categories(false), queryFn: () => inventoryService.categories(false) });

  const saved = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  };

  const stats = statsQuery.data;

  return (
    <>
      <PageHeader
        title="Ombor"
        description="Kitob, forma, texnika va boshqa mahsulotlar qoldig‘i"
        actions={
          <>
            <Button variant="secondary" leftIcon={<ArrowLeftRight className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'history' })}>
              Harakatlar
            </Button>
            {canManage && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'product' })}>
                Mahsulot
              </Button>
            )}
          </>
        }
      />

      {statsQuery.isPending ? (
        <Skeleton className="mb-6 h-24 w-full rounded-xl" />
      ) : statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => void statsQuery.refetch()} />
      ) : stats ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Package} label="Mahsulot turlari" value={formatNumber(stats.products)} />
          <StatCard icon={Boxes} label="Qoldiq qiymati" value={formatMoney(stats.stockValue)} />
          <StatCard icon={TriangleAlert} label="Kam qolgan" value={formatNumber(stats.lowStock)} tone={stats.lowStock > 0 ? 'bad' : undefined} />
          <StatCard icon={TriangleAlert} label="Tugagan" value={formatNumber(stats.outOfStock)} tone={stats.outOfStock > 0 ? 'bad' : undefined} />
        </div>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center">
          <SearchInput value={searchInput} onChange={setSearchInput} placeholder="Nom yoki kod" className="lg:max-w-xs" />
          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            aria-label="Turkum"
            wrapperClassName="lg:w-52"
          >
            <option value="">Barcha turkumlar</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant={onlyLowStock ? 'primary' : 'secondary'}
            onClick={() => {
              setOnlyLowStock((current) => !current);
              setPage(1);
            }}
          >
            Faqat kam qolganlar
          </Button>
        </div>

        {listQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Mahsulot yo‘q"
            description={canManage ? 'Mahsulot qo‘shing: kitob, forma, kantselyariya' : 'Ombor bo‘sh'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Mahsulot</TH>
                    <TH>Turkum</TH>
                    <TH className="text-right">Qoldiq</TH>
                    <TH className="text-right">Narxi</TH>
                    <TH className="text-right">Qoldiq qiymati</TH>
                    <TH className="w-40" />
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((product) => (
                    <TR key={product.id}>
                      <TD>
                        <p className="font-medium text-fg">{product.name}</p>
                        <p className="font-mono text-xs text-fg-subtle">{product.sku}</p>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{product.category.name}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <span className={cn('tabular-nums', product.quantity === 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                          {formatNumber(product.quantity)} {product.unit}
                        </span>
                        {product.isLowStock && (
                          <Badge tone="yellow" className="ml-2">
                            Kam qoldi
                          </Badge>
                        )}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{formatMoney(product.price)}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{formatMoney(product.stockValue)}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'history', product })}>
                            Tarix
                          </Button>
                          {canManage && (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'move', product })}>
                                Harakat
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'product', product })}>
                                Tahrir
                              </Button>
                            </>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={listQuery.data.meta.page}
              totalPages={listQuery.data.meta.totalPages}
              total={listQuery.data.meta.total}
              limit={listQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={listQuery.isFetching}
            />
          </>
        )}
      </Card>

      {dialog?.type === 'product' && (
        <ProductFormModal
          product={dialog.product}
          categories={categoriesQuery.data ?? []}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {dialog?.type === 'move' && <MovementModal product={dialog.product} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'history' && <MovementsHistory product={dialog.product} onClose={() => setDialog(null)} />}
    </>
  );
}
