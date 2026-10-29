import { DataTable } from '@/components/ui/DataTable';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, HandCoins, Paperclip, Plus, Repeat, Tags, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { useCreateIntent } from '@/hooks/useCreateIntent';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { useBranchParam } from '@/store/branch.store';
import { expensesService, incomesService } from '@/services/finance.service';
import type { ExpenseStatus, MoneyEntry, MoneyListParams } from '@/types/finance';
import { EXPENSE_STATUS_LABELS, EXPENSE_STATUS_ORDER, EXPENSE_STATUS_TONES } from '@/utils/financeLabels';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_TONES } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { AttachmentsModal } from './AttachmentsModal';
import { CategoryShareCard } from './CategoryShareCard';
import { PERIOD_PRESETS, matchPreset, presetRange } from './periodPresets';
import type { PeriodPreset } from './periodPresets';
import { CategoriesModal } from './CategoriesModal';
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
    | { type: 'categories' }
    | { type: 'attachments'; entry: MoneyEntry }
    | null
  >(null);
  useCreateIntent(() => setDialog({ type: 'create' }), canManage);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();
  const [voidError, setVoidError] = useState<string | null>(null);
  const branchParam = useBranchParam();

  const periodFilters = {
    ...branchParam,
    ...(search ? { search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const filters = { ...periodFilters, ...(categoryId ? { categoryId } : {}) };
  const preset = matchPreset(from, to);
  const applyPreset = (value: PeriodPreset) =>
    changeFilter(() => {
      const range = presetRange(value);
      setFrom(range.from);
      setTo(range.to);
    });
  const params: MoneyListParams = { ...filters, ...(!isIncome && status ? { status } : {}), page, limit: PAGE_SIZE };
  const keys = isIncome ? queryKeys.incomes : queryKeys.expenses;

  const listQuery = useQuery({
    queryKey: keys.list(params),
    queryFn: () => service.list(params),
    placeholderData: keepPreviousData,
  });
  // Ulush kartasi kategoriya filtridan mustaqil: tanlangan kategoriya umumiy ichida ajralib ko'rinadi
  const statsQuery = useQuery({ queryKey: keys.stats(periodFilters), queryFn: () => service.stats(periodFilters) });
  const categoriesQuery = useQuery({ queryKey: keys.categories, queryFn: service.categories, staleTime: 60_000 });
  const categoryName = (id: string) => categoriesQuery.data?.find((category) => category.id === id)?.name ?? 'Kategoriya';

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
  const periodTitle =
    preset === 'all' ? (isIncome ? 'Jami tushum' : 'Jami xarajat') : preset ? (PERIOD_PRESETS.find((item) => item.value === preset)?.label ?? '') : 'Tanlangan oraliq';
  const selectedStat = categoryId ? (stats?.byCategory.find((row) => row.id === categoryId) ?? { name: categoryName(categoryId), total: 0, count: 0 }) : null;
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
        <div className="mb-4 grid gap-3 lg:grid-cols-4">
          <Card className="p-4">
            <p className="truncate text-caption text-fg-muted">{selectedStat ? selectedStat.name : periodTitle}</p>
            <p className={cn('mt-1 text-h2 whitespace-nowrap tabular-nums', isIncome ? 'text-success' : 'text-danger')}>
              {formatMoney(selectedStat ? selectedStat.total : stats.total)}
            </p>
            <p className="mt-1 text-caption text-fg-muted">
              {formatNumber(selectedStat ? selectedStat.count : stats.count)} ta yozuv
              {selectedStat && stats.total > 0 && ` · umumiyning ${Math.round((selectedStat.total / stats.total) * 100)}%`}
            </p>
          </Card>
          <CategoryShareCard
            className="lg:col-span-3"
            rows={stats.byCategory}
            total={stats.total}
            selectedId={categoryId}
            onSelect={(id) => changeFilter(() => setCategoryId(id))}
          />
        </div>
      )}

      <Card>
        {!isIncome && (
          <Tabs value={status} onValueChange={(value) => changeFilter(() => setStatus(value as typeof status))} panels={false}>
            <TabList label="Xarajat holati" className="px-4">
              {(['', ...EXPENSE_STATUS_ORDER] as const).map((value) => (
                <Tab key={value || 'all'} value={value}>
                  {value ? EXPENSE_STATUS_LABELS[value] : 'Barchasi'}
                </Tab>
              ))}
            </TabList>
          </Tabs>
        )}
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Izoh, kategoriya yoki raqam"
              className="sm:max-w-xs"
            />
            <div className="flex gap-2">
              <Select
                value={categoryId}
                onChange={(event) => changeFilter(() => setCategoryId(event.target.value))}
                aria-label="Kategoriya"
                wrapperClassName="min-w-0 flex-1 sm:w-52 sm:flex-none"
              >
                <option value="">Barcha kategoriyalar</option>
                {(categoriesQuery.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <IconButton label="Kategoriyalar" variant="secondary" size="lg" className="size-10 shrink-0" onClick={() => setDialog({ type: 'categories' })}>
                <Tags aria-hidden />
              </IconButton>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Davr">
              {PERIOD_PRESETS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={preset === item.value}
                  onClick={() => applyPreset(item.value)}
                  className={cn(
                    'focus-ring h-8 shrink-0 rounded-pill px-3 text-caption font-medium whitespace-nowrap transition-colors',
                    preset === item.value ? 'bg-primary-subtle text-primary ring-1 ring-primary/30 ring-inset' : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </button>
              ))}
              {preset === null && <span className="flex h-8 shrink-0 items-center rounded-pill bg-surface-muted px-3 text-caption font-medium text-fg">Oraliq</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 lg:ml-auto lg:flex">
              <Input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => changeFilter(() => setFrom(event.target.value))}
                aria-label="Boshlanish sanasi"
                className="lg:w-44"
              />
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => changeFilter(() => setTo(event.target.value))}
                aria-label="Tugash sanasi"
                className="lg:w-44"
              />
            </div>
          </div>
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
            <DataTable
              bare
              label="Yozuvlar"
              rows={listQuery.data.items}
              rowKey={(entry) => entry.id}
              rowClassName={(entry) => cn(entry.isVoided && 'opacity-60')}
              stale={listQuery.isPlaceholderData}
              mobileLayout="cards"
              columns={[
                {
                  key: 'c0',
                  label: 'Raqam',
                  thClassName: 'w-20',
                  tdClassName: 'font-mono text-caption text-fg-muted',
                  cell: (entry) => <>#{entry.number}</>,
                },
                {
                  key: 'c1',
                  label: 'Kategoriya',
                  cell: (entry) => (
                    <>
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
                      {entry.description && <p className="truncate text-caption text-fg-muted">{entry.description}</p>}
                      {(entry.vendor || entry.recurring || entry.source) && (
                        <p className="truncate text-caption text-fg-muted">
                          {[entry.vendor, entry.source?.name ?? null, entry.recurring ? 'takroriy' : null].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {entry.status === 'REJECTED' && entry.rejectReason && (
                        <p className="truncate text-caption text-danger">{entry.rejectReason}</p>
                      )}
                      {entry.isVoided && entry.voidReason && (
                        <p className="truncate text-caption text-danger">{entry.voidReason}</p>
                      )}
                    </>
                  ),
                },
                {
                  key: 'c2',
                  label: 'Summa',
                  align: 'right',
                  tdClassName: (entry) => cn( 'font-medium whitespace-nowrap', entry.isVoided ? 'text-fg-muted line-through' : isIncome ? 'text-success' : 'text-fg', ),
                  cell: (entry) => (
                    <>
                      {formatMoney(entry.amount)}
                    </>
                  ),
                },
                {
                  key: 'c3',
                  label: 'Usul / kassa',
                  cell: (entry) => (
                    <>
                      <Badge tone={PAYMENT_METHOD_TONES[entry.method]}>{PAYMENT_METHOD_LABELS[entry.method]}</Badge>
                      {entry.account && <p className="mt-1 text-caption text-fg-muted">{entry.account.name}</p>}
                    </>
                  ),
                },
                {
                  key: 'c4',
                  label: 'Sana',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (entry) => (
                    <>
                      {formatDate(entry.dueDate && entry.status !== 'PAID' ? entry.dueDate : entry.date)}
                      {entry.status !== 'PAID' && entry.status !== 'REJECTED' && <p className="text-caption">muddat</p>}
                    </>
                  ),
                },
                {
                  key: 'c5',
                  label: 'Kim kiritdi',
                  tdClassName: 'whitespace-nowrap text-fg-muted',
                  cell: (entry) => (
                    <>
                      {entry.responsible ? `${entry.responsible.firstName} ${entry.responsible.lastName}` : '—'}
                    </>
                  ),
                },
                {
                  key: 'c6',
                  label: 'Amallar',
                  header: <span className="sr-only">Amallar</span>,
                  fixed: true,
                  thClassName: 'w-12',
                  tdClassName: 'text-right',
                  cell: (entry) => (
                    <>
                      <ActionMenu label={`#${entry.number} amallari`} items={[attachmentsItem(entry), ...rowActions(entry)]} />
                    </>
                  ),
                },
              ]}
            />
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

      {dialog?.type === 'categories' && <CategoriesModal kind={kind} canManage={canManage} onClose={() => setDialog(null)} />}

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
