import { StatCard } from '@/components/ui/StatCard';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus, Undo2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '@/components/ui/DataTable';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Checkbox } from '@/components/ui/Checkbox';
import { PageHeader } from '@/components/PageHeader';
import { OnlinePaymentsCard } from './OnlinePaymentsCard';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { useBranchParam } from '@/store/branch.store';
import { paymentsService } from '@/services/payments.service';
import type { PaymentItem, PaymentListParams, PaymentMethod, PaymentStatsParams } from '@/types/payment';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER, PAYMENT_METHOD_TONES } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { CancelPaymentModal } from './CancelPaymentModal';
import { PaymentFormModal } from './PaymentFormModal';
import { RefundPaymentModal } from './RefundPaymentModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';
import { ColumnSettings } from '@/components/ColumnSettings';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { ColumnDef } from '@/utils/tableColumns';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'paidAt:desc', label: 'Avval yangilari' },
  { value: 'paidAt:asc', label: 'Avval eskilari' },
  { value: 'amount:desc', label: 'Katta summa' },
  { value: 'number:desc', label: 'Kvitansiya raqami' },
] as const;

type Dialog = { type: 'create' } | { type: 'cancel'; payment: PaymentItem } | { type: 'refund'; payment: PaymentItem } | null;

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const canCreate = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const canDelete = usePermission(PERMISSIONS.PAYMENT_DELETE);
  const canRefund = usePermission(PERMISSIONS.PAYMENT_REFUND);

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [method, setMethod] = useState<PaymentMethod | ''>('');
  const [courseId, setCourseId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]['value']>('paidAt:desc');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog>(null);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();

  const [sortBy, sortOrder] = sort.split(':') as [PaymentListParams['sortBy'], PaymentListParams['sortOrder']];
  const filters: PaymentStatsParams = {
    ...(search ? { search } : {}),
    ...(method ? { method } : {}),
    ...(courseId ? { courseId } : {}),
    ...(managerId ? { managerId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const branchParam = useBranchParam();
  const params: PaymentListParams = {
    ...branchParam,
    ...filters,
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    includeDeleted: includeDeleted ? 'true' : 'false',
  };

  const paymentsQuery = useQuery({
    queryKey: queryKeys.payments.list(params),
    queryFn: () => paymentsService.list(params),
    placeholderData: keepPreviousData,
  });
  const statsQuery = useQuery({
    queryKey: queryKeys.payments.stats(filters),
    queryFn: () => paymentsService.stats(filters),
  });
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
  };

  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const stats = statsQuery.data;

  type PaymentTableRow = NonNullable<typeof paymentsQuery.data>['items'][number];
  const paymentTableColumns: Array<ColumnDef<PaymentTableRow>> = [
    {
      key: 'receipt',
      label: 'Kvitansiya',
      required: true,
      tdClassName: 'font-mono text-xs whitespace-nowrap text-fg-muted',
      cell: (payment: PaymentTableRow) => (
        <>
          {payment.code}
          {payment.isDeleted && (
            <Badge tone="red" className="ml-2">
              Bekor qilingan
            </Badge>
          )}
        </>
      ),
    },
    {
      key: 'student',
      label: 'O‘quvchi',
      cell: (payment: PaymentTableRow) => (
        <>
          <p className="font-medium text-fg">
            {payment.student.firstName} {payment.student.lastName}
          </p>
          <p className="text-xs text-fg-muted">
            {payment.student.code} · {formatPhone(payment.student.phone)} · {payment.course.name}
          </p>
        </>
      ),
    },
    {
      key: 'amount',
      label: 'Summa',
      tdClassName: (payment: PaymentTableRow) => cn('font-medium whitespace-nowrap', payment.isDeleted ? 'text-fg-muted line-through' : 'text-fg'),
      cell: (payment: PaymentTableRow) => (
        <>
          {formatMoney(payment.amount)}
          {payment.refundedAmount > 0 && (
            <p className="text-xs font-normal text-warning">qaytarilgan {formatMoney(payment.refundedAmount)}</p>
          )}
        </>
      ),
    },
    {
      key: 'method',
      label: 'Usul',
      cell: (payment: PaymentTableRow) => (
        <>
          <Badge tone={PAYMENT_METHOD_TONES[payment.method]}>{PAYMENT_METHOD_LABELS[payment.method]}</Badge>
        </>
      ),
    },
    {
      key: 'paidAt',
      label: 'Sana',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (payment: PaymentTableRow) => (
        <>
          {formatDate(payment.paidAt)}
        </>
      ),
    },
    {
      key: 'receivedBy',
      label: 'Qabul qildi',
      tdClassName: 'whitespace-nowrap text-fg-muted',
      cell: (payment: PaymentTableRow) => (
        <>
          {payment.accountant ? `${payment.accountant.firstName} ${payment.accountant.lastName}` : '—'}
          {payment.isDeleted && payment.deleteReason && (
            <p className="max-w-[16rem] truncate text-xs text-danger">{payment.deleteReason}</p>
          )}
        </>
      ),
    },
    ...((canDelete || canRefund) ? [{
      key: 'actions',
      label: 'Amallar',
      header: <span className="sr-only">Amallar</span>,
      fixed: true,
      thClassName: 'w-12',
      tdClassName: 'text-right',
      cell: (payment: PaymentTableRow) => (
        <>
          {payment.isDeleted ? (
            <span className="text-xs text-fg-subtle">—</span>
          ) : (
            <ActionMenu
              label={`${payment.code} amallari`}
              items={[
                ...(canRefund && payment.amount - payment.refundedAmount > 0
                  ? [{ label: 'Pulni qaytarish', icon: Undo2, onSelect: () => setDialog({ type: 'refund', payment }) }]
                  : []),
                ...(canDelete && payment.refundedAmount === 0
                  ? [
                      {
                        label: 'To‘lovni bekor qilish',
                        icon: Ban,
                        tone: 'danger' as const,
                        onSelect: () => setDialog({ type: 'cancel', payment }),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </>
      ),
    }] : []),
  ];
  const paymentTable = useTableColumns('payments', paymentTableColumns);
  const density = useTableDensity();

  return (
    <>
      <PageHeader
        title="To‘lovlar"
        description="Kvitansiyalar, to‘lov usullari va bekor qilingan to‘lovlar"
        actions={
          <>
            {canExport && (
              <ExportMenu
                loading={exporting}
                onExport={(format) => void runExport('/payments/export', { ...params, page: undefined, limit: undefined }, 'tolovlar', format)}
              />
            )}
            {canCreate && (
              <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'create' })}>
                To‘lov qabul qilish
              </Button>
            )}
          </>
        }
      />

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard size="sm" title="Tanlangan davr tushumi" value={formatMoney(stats.total)} description={`${formatNumber(stats.count)} ta to‘lov`} />
          {stats.byMethod.slice(0, 3).map((row) => (
            <StatCard key={row.method} size="sm" title={PAYMENT_METHOD_LABELS[row.method]} value={formatMoney(row.total)} description={`${formatNumber(row.count)} ta to‘lov`} />
          ))}
        </div>
      )}

      <DataTable
        label="To‘lovlar"
        columns={paymentTable.visibleColumns}
        rows={paymentsQuery.data?.items}
        rowKey={(payment) => payment.id}
        rowClassName={(payment) => payment.isDeleted && 'opacity-60'}
        loading={paymentsQuery.isPending}
        error={paymentsQuery.error}
        onRetry={() => void paymentsQuery.refetch()}
        retrying={paymentsQuery.isFetching}
        stale={paymentsQuery.isPlaceholderData}
        empty={{
          icon: Wallet,
          title: 'To‘lov topilmadi',
          description: canCreate ? 'Yangi to‘lov qabul qiling yoki filtrlarni o‘zgartiring' : 'Filtrlarni o‘zgartirib ko‘ring',
        }}
        toolbar={
          <FilterBar
            search={{ value: searchInput, onChange: (value) => changeFilter(() => setSearchInput(value)), placeholder: 'Ism, telefon, PM- yoki ST-raqam' }}
            activeCount={[method, courseId, managerId, from, to].filter(Boolean).length + Number(includeDeleted)}
            onClear={() =>
              changeFilter(() => {
                setMethod('');
                setCourseId('');
                setManagerId('');
                setFrom('');
                setTo('');
                setIncludeDeleted(false);
              })
            }
          >
            <FilterField>
              <Select value={method} onChange={(event) => changeFilter(() => setMethod(event.target.value as PaymentMethod | ''))} aria-label="To‘lov usuli">
                <option value="">Barcha usullar</option>
                {PAYMENT_METHOD_ORDER.map((item) => (
                  <option key={item} value={item}>
                    {PAYMENT_METHOD_LABELS[item]}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField className="sm:w-48">
              <Select value={courseId} onChange={(event) => changeFilter(() => setCourseId(event.target.value))} aria-label="Kurs">
                <option value="">Barcha kurslar</option>
                {lookupsQuery.data?.courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField className="sm:w-48">
              <Select value={managerId} onChange={(event) => changeFilter(() => setManagerId(event.target.value))} aria-label="Manager">
                <option value="">Barcha managerlar</option>
                {lookupsQuery.data?.managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.firstName} {manager.lastName}
                  </option>
                ))}
              </Select>
            </FilterField>
            <FilterField className="sm:w-40" caption="Boshlanish sanasi">
              <Input type="date" value={from} onChange={(event) => changeFilter(() => setFrom(event.target.value))} aria-label="Boshlanish sanasi" />
            </FilterField>
            <FilterField className="sm:w-40" caption="Tugash sanasi">
              <Input type="date" value={to} onChange={(event) => changeFilter(() => setTo(event.target.value))} aria-label="Tugash sanasi" />
            </FilterField>
            <FilterField className="sm:w-auto">
              <Checkbox label="Bekor qilinganlar ham" checked={includeDeleted} onChange={(event) => changeFilter(() => setIncludeDeleted(event.target.checked))} />
            </FilterField>
          </FilterBar>
        }
        toolbarActions={
          <>
            <Select value={sort} onChange={(event) => changeFilter(() => setSort(event.target.value as typeof sort))} aria-label="Saralash" wrapperClassName="w-44">
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <ColumnSettings control={paymentTable} />
          </>
        }
        {...density}
        {...(paymentsQuery.data
          ? {
              pagination: {
                page: paymentsQuery.data.meta.page,
                totalPages: paymentsQuery.data.meta.totalPages,
                total: paymentsQuery.data.meta.total,
                limit: paymentsQuery.data.meta.limit,
                onPageChange: setPage,
                disabled: paymentsQuery.isFetching,
              },
            }
          : {})}
      />

      {dialog?.type === 'create' && (
        <PaymentFormModal
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog?.type === 'cancel' && (
        <CancelPaymentModal
          payment={dialog.payment}
          onClose={() => setDialog(null)}
          onCancelled={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'refund' && (
        <RefundPaymentModal
          payment={dialog.payment}
          onClose={() => setDialog(null)}
          onRefunded={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      <OnlinePaymentsCard />
    </>
  );
}
