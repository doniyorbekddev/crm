import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, HandCoins, Paperclip, Plus, Repeat, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { expensesService, incomesService } from '@/services/finance.service';
import type { ExpenseStatus, MoneyEntry, MoneyListParams } from '@/types/finance';
import { EXPENSE_STATUS_LABELS, EXPENSE_STATUS_ORDER, EXPENSE_STATUS_TONES } from '@/utils/financeLabels';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_TONES } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { AttachmentsModal } from './AttachmentsModal';
import { MoneyFormModal } from './MoneyFormModal';
import { RecurringExpensesModal } from './RecurringExpensesModal';
import { VoidReasonModal } from './VoidReasonModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';

const PAGE_SIZE = 20;

interface MoneyPageProps {
  kind: 'income' | 'expense';
}

/** Tushumlar va xarajatlar sahifasi — ikkalasi bir xil ishlaydi, faqat yo‘nalishi boshqa */
export function MoneyPage({ kind }: MoneyPageProps) {
  const queryClient = useQueryClient();
  const isIncome = kind === 'income';
  const service = isIncome ? incomesService : expensesService;
  const canManage = usePermission(isIncome ? PERMISSIONS.INCOME_MANAGE : PERMISSIONS.EXPENSE_MANAGE);
  const canApprove = usePermission(PERMISSIONS.EXPENSE_APPROVE) && !isIncome;

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [categoryId, setCategoryId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ExpenseStatus | ''>('');
  const [dialog, setDialog] = useState<
    | { type: 'create' }
    | { type: 'void'; entry: MoneyEntry }
    | { type: 'reject'; entry: MoneyEntry }
    | { type: 'pay'; entry: MoneyEntry }
    | { type: 'recurring' }
    | { type: 'attachments'; entry: MoneyEntry }
    | null
  >(null);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();
  const [voidError, setVoidError] = useState<string | null>(null);

  const filters = {
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const params: MoneyListParams = { ...filters, ...(!isIncome && status ? { status } : {}), page, limit: PAGE_SIZE };
  const keys = isIncome ? queryKeys.incomes : queryKeys.expenses;

  const listQuery = useQuery({
    queryKey: keys.list(params),
    queryFn: () => service.list(params),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({ queryKey: keys.stats(filters), queryFn: () => service.stats(filters) });
  const categoriesQuery = useQuery({ queryKey: keys.categories, queryFn: service.categories, staleTime: 60_000 });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  };

  const voidEntry = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => service.void(id, reason),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => setVoidError(getErrorMessage(error)),
  });

  const approve = useMutation({
    mutationFn: (id: string) => service.approve(id),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => service.reject(id, reason),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => setVoidError(getErrorMessage(error)),
  });

  const pay = useMutation({
    mutationFn: (id: string) => service.pay(id),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  /** Holatga qarab amallar: tasdiqlash (rahbar), to‘lash, rad etish, bekor qilish */
  const rowActions = (entry: MoneyEntry) => {
    if (entry.isVoided || entry.status === 'REJECTED') return [];
    if (entry.status === 'PAID') {
      return canManage
        ? [
            {
              label: 'Bekor qilish',
              icon: Ban,
              tone: 'danger' as const,
              onSelect: () => {
                setVoidError(null);
                setDialog({ type: 'void', entry });
              },
            },
          ]
        : [];
    }
    const canReject = (entry.status !== 'UPCOMING' && canApprove) || (entry.status === 'UPCOMING' && canManage);
    return [
      ...(entry.status === 'PENDING' && canApprove ? [{ label: 'Tasdiqlash', icon: BadgeCheck, onSelect: () => approve.mutate(entry.id) }] : []),
      ...((entry.status === 'APPROVED' || entry.status === 'UPCOMING') && canManage
        ? [{ label: 'To‘lash', icon: HandCoins, onSelect: () => setDialog({ type: 'pay', entry }) }]
        : []),
      ...(canReject
        ? [
            {
              label: entry.status === 'UPCOMING' ? 'Bu oy o‘tkazib yuborish' : 'Rad etish',
              icon: XCircle,
              tone: 'danger' as const,
              onSelect: () => {
                setVoidError(null);
                setDialog({ type: 'reject', entry });
              },
            },
          ]
        : []),
    ];
  };

  const attachmentsItem = (entry: MoneyEntry) => ({
    label: entry.attachments > 0 ? `Cheklar (${entry.attachments})` : canManage ? 'Chek biriktirish' : 'Cheklar',
    icon: Paperclip,
    onSelect: () => setDialog({ type: 'attachments', entry }),
  });

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const stats = statsQuery.data;
  const title = isIncome ? 'Tushumlar' : 'Xarajatlar';

  return (
    <>
      <PageHeader
        title={title}
        description={
          isIncome
            ? 'O‘quv to‘lovidan tashqari tushumlar — ro‘yxatga olish, kitob, forma va boshqalar'
            : 'Ijara, reklama, kommunal va boshqa xarajatlar'
        }
        actions={
          <>
            {canExport && (
              <ExportMenu
                loading={exporting}
                onExport={(format) =>
                  void runExport(`/reports/${isIncome ? 'incomes' : 'expenses'}/export`, { ...(from ? { from } : {}), ...(to ? { to } : {}) }, isIncome ? 'tushumlar' : 'xarajatlar', format)
                }
              />
            )}
            {!isIncome && (
              <Button variant="secondary" leftIcon={<Repeat className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'recurring' })}>
                Takroriy
              </Button>
            )}
            {canManage && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
                {isIncome ? 'Tushum qo‘shish' : 'Xarajat qo‘shish'}
              </Button>
            )}
          </>
        }
      />

      {stats && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Tanlangan davr</p>
            <p className={cn('mt-1 text-xl font-semibold', isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {formatMoney(stats.total)}
            </p>
            <p className="mt-1 text-xs text-fg-muted">{formatNumber(stats.count)} ta yozuv</p>
          </Card>
          {stats.byCategory.slice(0, 3).map((row) => (
            <Card key={row.id} className="p-4">
              <p className="truncate text-xs text-fg-muted">{row.name}</p>
              <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(row.total)}</p>
              <p className="mt-1 text-xs text-fg-muted">{formatNumber(row.count)} ta yozuv</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        {!isIncome && (
          <div role="tablist" aria-label="Xarajat holati" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
            {(['', ...EXPENSE_STATUS_ORDER] as const).map((value) => {
              const active = status === value;
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeFilter(() => setStatus(value))}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
                    active ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-200' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {value ? EXPENSE_STATUS_LABELS[value] : 'Barchasi'}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput
            value={searchInput}
            onChange={(value) => changeFilter(() => setSearchInput(value))}
            placeholder="Izoh, kategoriya yoki raqam"
            className="sm:max-w-xs"
          />
          <Select
            value={categoryId}
            onChange={(event) => changeFilter(() => setCategoryId(event.target.value))}
            aria-label="Kategoriya"
            wrapperClassName="sm:w-52"
          >
            <option value="">Barcha kategoriyalar</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(event) => changeFilter(() => setFrom(event.target.value))}
            aria-label="Boshlanish sanasi"
            className="sm:w-44"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => changeFilter(() => setTo(event.target.value))}
            aria-label="Tugash sanasi"
            className="sm:w-44"
          />
        </div>

        {listQuery.isPending ? (
          <TableSkeleton rows={6} columns={5} />
        ) : listQuery.isError ? (
          <ErrorState error={listQuery.error} retrying={listQuery.isFetching} onRetry={() => void listQuery.refetch()} />
        ) : listQuery.data.items.length === 0 ? (
          <EmptyState
            icon={isIncome ? TrendingUp : TrendingDown}
            title={isIncome ? 'Tushum topilmadi' : 'Xarajat topilmadi'}
            description={canManage ? 'Yangi yozuv qo‘shing yoki filtrlarni o‘zgartiring' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', listQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH className="w-20">Raqam</TH>
                    <TH>Kategoriya</TH>
                    <TH>Summa</TH>
                    <TH>Usul / kassa</TH>
                    <TH>Sana</TH>
                    <TH>Kim kiritdi</TH>
                    <TH className="w-12">
                      <span className="sr-only">Amallar</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {listQuery.data.items.map((entry) => (
                    <TR key={entry.id} className={cn(entry.isVoided && 'opacity-60')}>
                      <TD className="font-mono text-xs text-fg-muted">#{entry.number}</TD>
                      <TD>
                        <p className="font-medium text-fg">
                          {entry.category.name}
                          {entry.attachments > 0 && (
                            <Paperclip className="ml-1.5 inline size-3.5 text-fg-subtle" aria-label={`${entry.attachments} ta chek`} />
                          )}
                          {entry.isVoided && (
                            <Badge tone="red" className="ml-2">
                              Bekor qilingan
                            </Badge>
                          )}
                          {entry.status !== 'PAID' && (
                            <Badge tone={EXPENSE_STATUS_TONES[entry.status]} className="ml-2">
                              {EXPENSE_STATUS_LABELS[entry.status]}
                            </Badge>
                          )}
                        </p>
                        {entry.description && <p className="truncate text-xs text-fg-muted">{entry.description}</p>}
                        {(entry.vendor || entry.recurring) && (
                          <p className="truncate text-xs text-fg-muted">
                            {[entry.vendor, entry.recurring ? 'takroriy' : null].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {entry.status === 'REJECTED' && entry.rejectReason && (
                          <p className="truncate text-xs text-red-600 dark:text-red-400">{entry.rejectReason}</p>
                        )}
                        {entry.isVoided && entry.voidReason && (
                          <p className="truncate text-xs text-red-600 dark:text-red-400">{entry.voidReason}</p>
                        )}
                      </TD>
                      <TD
                        className={cn(
                          'font-medium whitespace-nowrap',
                          entry.isVoided ? 'text-fg-muted line-through' : isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg',
                        )}
                      >
                        {formatMoney(entry.amount)}
                      </TD>
                      <TD>
                        <Badge tone={PAYMENT_METHOD_TONES[entry.method]}>{PAYMENT_METHOD_LABELS[entry.method]}</Badge>
                        {entry.account && <p className="mt-1 text-xs text-fg-muted">{entry.account.name}</p>}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {formatDate(entry.dueDate && entry.status !== 'PAID' ? entry.dueDate : entry.date)}
                        {entry.status !== 'PAID' && entry.status !== 'REJECTED' && <p className="text-xs">muddat</p>}
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {entry.responsible ? `${entry.responsible.firstName} ${entry.responsible.lastName}` : '—'}
                      </TD>
                      <TD className="text-right">
                        <ActionMenu label={`#${entry.number} amallari`} items={[attachmentsItem(entry), ...rowActions(entry)]} />
                      </TD>
                    </TR>
                  ))}
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
      </Card>

      {dialog?.type === 'create' && (
        <MoneyFormModal
          kind={kind}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'void' && (
        <VoidReasonModal
          title={isIncome ? 'Tushumni bekor qilish' : 'Xarajatni bekor qilish'}
          description={`#${dialog.entry.number} · ${dialog.entry.category.name} · ${formatMoney(dialog.entry.amount)}`}
          loading={voidEntry.isPending}
          error={voidError}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => voidEntry.mutate({ id: dialog.entry.id, reason })}
        />
      )}

      {dialog?.type === 'reject' && (
        <VoidReasonModal
          title={dialog.entry.status === 'UPCOMING' ? 'Bu oy uchun o‘tkazib yuborish' : 'Xarajatni rad etish'}
          description={`#${dialog.entry.number} · ${dialog.entry.category.name} · ${formatMoney(dialog.entry.amount)}`}
          loading={reject.isPending}
          error={voidError}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => reject.mutate({ id: dialog.entry.id, reason })}
        />
      )}

      <ConfirmDialog
        open={dialog?.type === 'pay'}
        tone="primary"
        title="Xarajatni to‘lash"
        description={
          dialog?.type === 'pay'
            ? `#${dialog.entry.number} · ${dialog.entry.category.name} · ${formatMoney(dialog.entry.amount)} — kassadan yechiladi va moliyaviy daftarga yoziladi.`
            : ''
        }
        confirmLabel="To‘lash"
        loading={pay.isPending}
        onConfirm={() => dialog?.type === 'pay' && pay.mutate(dialog.entry.id)}
        onCancel={() => setDialog(null)}
      />

      {dialog?.type === 'recurring' && <RecurringExpensesModal onClose={() => setDialog(null)} onChanged={refresh} />}

      {dialog?.type === 'attachments' && (
        <AttachmentsModal
          owner={isIncome ? 'income' : 'expense'}
          entityId={dialog.entry.id}
          title={`#${dialog.entry.number} · ${dialog.entry.category.name} · ${formatMoney(dialog.entry.amount)}`}
          canManage={canManage}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
