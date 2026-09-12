import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { FinanceRangeParams, Transaction, TransactionListParams, TransactionType } from '@/types/finance';
import { formatDateTime, formatMoney } from '@/utils/format';
import {
  TRANSACTION_SOURCE_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_ORDER,
  TRANSACTION_TYPE_TONES,
} from '@/utils/financeLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { VoidReasonModal } from './VoidReasonModal';

const PAGE_SIZE = 20;

interface TransactionsTabProps {
  range: FinanceRangeParams;
}

/** Moliyaviy daftar: har bir pul harakati shu yerda ko‘rinadi */
export function TransactionsTab({ range }: TransactionsTabProps) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.FINANCE_MANAGE);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [type, setType] = useState<TransactionType | ''>('');
  const [accountId, setAccountId] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Transaction | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);

  const params: TransactionListParams = {
    ...range,
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(type ? { type } : {}),
    ...(accountId ? { accountId } : {}),
  };

  const listQuery = useQuery({
    queryKey: queryKeys.finance.transactions(params),
    queryFn: () => financeService.transactions(params),
    placeholderData: keepPreviousData,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts({}),
    queryFn: () => financeService.accounts(),
    staleTime: 60_000,
  });

  const voidTransaction = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => financeService.voidTransaction(id, reason),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incomes.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    },
    onError: (error) => setVoidError(getErrorMessage(error)),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
        <SearchInput
          value={searchInput}
          onChange={(value) => changeFilter(() => setSearchInput(value))}
          placeholder="Izoh, kategoriya yoki raqam"
          className="sm:max-w-xs"
        />
        <Select
          value={type}
          onChange={(event) => changeFilter(() => setType(event.target.value as TransactionType | ''))}
          aria-label="Tur"
          wrapperClassName="sm:w-44"
        >
          <option value="">Barcha turlar</option>
          {TRANSACTION_TYPE_ORDER.map((item) => (
            <option key={item} value={item}>
              {TRANSACTION_TYPE_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select
          value={accountId}
          onChange={(event) => changeFilter(() => setAccountId(event.target.value))}
          aria-label="Kassa"
          wrapperClassName="sm:w-48"
        >
          <option value="">Barcha kassalar</option>
          {(accountsQuery.data?.items ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </div>

      {listQuery.isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : listQuery.isError ? (
        <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
      ) : listQuery.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title="Yozuv topilmadi" description="Sana oralig‘i yoki filtrlarni o‘zgartirib ko‘ring" />
      ) : (
        <>
          <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH className="w-16">№</TH>
                  <TH>Tur</TH>
                  <TH>Izoh</TH>
                  <TH>Kassa</TH>
                  <TH className="text-right">Summa</TH>
                  <TH>Sana</TH>
                  {canManage && (
                    <TH className="w-12">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  )}
                </tr>
              </THead>
              <TBody>
                {listQuery.data.items.map((transaction) => {
                  const voided = transaction.status !== 'COMPLETED';
                  const outgoing = transaction.type === 'EXPENSE' || transaction.type === 'REFUND';
                  return (
                    <TR key={transaction.id} className={cn(voided && 'opacity-60')}>
                      <TD className="font-mono text-xs text-fg-muted">{transaction.number}</TD>
                      <TD>
                        <Badge tone={TRANSACTION_TYPE_TONES[transaction.type]}>
                          {TRANSACTION_TYPE_LABELS[transaction.type]}
                        </Badge>
                        {voided && (
                          <Badge tone="red" className="ml-1">
                            {TRANSACTION_STATUS_LABELS[transaction.status]}
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <p className="truncate text-fg">{transaction.description ?? transaction.categoryName ?? '—'}</p>
                        <p className="text-xs text-fg-muted">
                          {transaction.categoryName ?? '—'}
                          {transaction.entityType && ` · ${TRANSACTION_SOURCE_LABELS[transaction.entityType] ?? transaction.entityType}`}
                        </p>
                        {voided && transaction.voidReason && (
                          <p className="truncate text-xs text-red-600 dark:text-red-400">{transaction.voidReason}</p>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{transaction.account?.name ?? '—'}</TD>
                      <TD
                        className={cn(
                          'text-right font-medium whitespace-nowrap',
                          voided ? 'text-fg-muted line-through' : outgoing ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {outgoing ? '−' : '+'}
                        {formatMoney(transaction.amount)}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDateTime(transaction.occurredAt)}</TD>
                      {canManage && (
                        <TD className="text-right">
                          {voided ? (
                            <span className="text-xs text-fg-subtle">—</span>
                          ) : (
                            <ActionMenu
                              label={`${transaction.number} amallari`}
                              items={[
                                {
                                  label: 'Bekor qilish',
                                  icon: Ban,
                                  tone: 'danger',
                                  onSelect: () => {
                                    setVoidError(null);
                                    setDialog(transaction);
                                  },
                                },
                              ]}
                            />
                          )}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
          <Pagination
            page={page}
            totalPages={listQuery.data.meta.totalPages}
            total={listQuery.data.meta.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
            disabled={listQuery.isPlaceholderData}
          />
        </>
      )}

      {dialog && (
        <VoidReasonModal
          title="Moliyaviy yozuvni bekor qilish"
          description={`№${dialog.number} · ${TRANSACTION_TYPE_LABELS[dialog.type]} · ${formatMoney(dialog.amount)}`}
          loading={voidTransaction.isPending}
          error={voidError}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => voidTransaction.mutate({ id: dialog.id, reason })}
        />
      )}
    </Card>
  );
}
