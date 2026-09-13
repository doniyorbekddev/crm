import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import type { PaymentItem, PaymentListParams, PaymentMethod, PaymentStatsParams } from '@/types/payment';
import { formatDate, formatMoney, formatNumber, formatPhone } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER, PAYMENT_METHOD_TONES } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { CancelPaymentModal } from './CancelPaymentModal';
import { PaymentFormModal } from './PaymentFormModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'paidAt:desc', label: 'Avval yangilari' },
  { value: 'paidAt:asc', label: 'Avval eskilari' },
  { value: 'amount:desc', label: 'Katta summa' },
  { value: 'number:desc', label: 'Kvitansiya raqami' },
] as const;

type Dialog = { type: 'create' } | { type: 'cancel'; payment: PaymentItem } | null;

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const canCreate = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const canDelete = usePermission(PERMISSIONS.PAYMENT_DELETE);

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
  const params: PaymentListParams = {
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
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Tanlangan davr tushumi</p>
            <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(stats.total)}</p>
            <p className="mt-1 text-xs text-fg-muted">{formatNumber(stats.count)} ta to‘lov</p>
          </Card>
          {stats.byMethod.slice(0, 3).map((row) => (
            <Card key={row.method} className="p-4">
              <p className="text-xs text-fg-muted">{PAYMENT_METHOD_LABELS[row.method]}</p>
              <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(row.total)}</p>
              <p className="mt-1 text-xs text-fg-muted">{formatNumber(row.count)} ta to‘lov</p>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput
              value={searchInput}
              onChange={(value) => changeFilter(() => setSearchInput(value))}
              placeholder="Ism, telefon, PM- yoki ST-raqam"
              className="sm:max-w-xs"
            />
            <Select
              value={method}
              onChange={(event) => changeFilter(() => setMethod(event.target.value as PaymentMethod | ''))}
              aria-label="To‘lov usuli"
              wrapperClassName="sm:w-44"
            >
              <option value="">Barcha usullar</option>
              {PAYMENT_METHOD_ORDER.map((item) => (
                <option key={item} value={item}>
                  {PAYMENT_METHOD_LABELS[item]}
                </option>
              ))}
            </Select>
            <Select
              value={courseId}
              onChange={(event) => changeFilter(() => setCourseId(event.target.value))}
              aria-label="Kurs"
              wrapperClassName="sm:w-48"
            >
              <option value="">Barcha kurslar</option>
              {lookupsQuery.data?.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
            <Select
              value={managerId}
              onChange={(event) => changeFilter(() => setManagerId(event.target.value))}
              aria-label="Manager"
              wrapperClassName="sm:w-48"
            >
              <option value="">Barcha managerlar</option>
              {lookupsQuery.data?.managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.firstName} {manager.lastName}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            <label className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(event) => changeFilter(() => setIncludeDeleted(event.target.checked))}
                className="size-4 rounded border-border text-brand-600 focus:ring-brand-500"
              />
              Bekor qilinganlar ham
            </label>
            <Select
              value={sort}
              onChange={(event) => changeFilter(() => setSort(event.target.value as typeof sort))}
              aria-label="Saralash"
              wrapperClassName="sm:w-48 sm:ml-auto"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {paymentsQuery.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : paymentsQuery.isError ? (
          <ErrorState error={paymentsQuery.error} retrying={paymentsQuery.isFetching} onRetry={() => void paymentsQuery.refetch()} />
        ) : paymentsQuery.data.items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="To‘lov topilmadi"
            description={canCreate ? 'Yangi to‘lov qabul qiling yoki filtrlarni o‘zgartiring' : 'Filtrlarni o‘zgartirib ko‘ring'}
          />
        ) : (
          <>
            <TableContainer className={cn('transition-opacity', paymentsQuery.isPlaceholderData && 'opacity-60')}>
              <Table>
                <THead>
                  <tr>
                    <TH>Kvitansiya</TH>
                    <TH>O‘quvchi</TH>
                    <TH>Summa</TH>
                    <TH>Usul</TH>
                    <TH>Sana</TH>
                    <TH>Qabul qildi</TH>
                    {canDelete && (
                      <TH className="w-12">
                        <span className="sr-only">Amallar</span>
                      </TH>
                    )}
                  </tr>
                </THead>
                <TBody>
                  {paymentsQuery.data.items.map((payment) => (
                    <TR key={payment.id} className={cn(payment.isDeleted && 'opacity-60')}>
                      <TD className="font-mono text-xs whitespace-nowrap text-fg-muted">
                        {payment.code}
                        {payment.isDeleted && (
                          <Badge tone="red" className="ml-2">
                            Bekor qilingan
                          </Badge>
                        )}
                      </TD>
                      <TD>
                        <p className="font-medium text-fg">
                          {payment.student.firstName} {payment.student.lastName}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {payment.student.code} · {formatPhone(payment.student.phone)} · {payment.course.name}
                        </p>
                      </TD>
                      <TD className={cn('font-medium whitespace-nowrap', payment.isDeleted ? 'text-fg-muted line-through' : 'text-fg')}>
                        {formatMoney(payment.amount)}
                      </TD>
                      <TD>
                        <Badge tone={PAYMENT_METHOD_TONES[payment.method]}>{PAYMENT_METHOD_LABELS[payment.method]}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted">{formatDate(payment.paidAt)}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        {payment.accountant ? `${payment.accountant.firstName} ${payment.accountant.lastName}` : '—'}
                        {payment.isDeleted && payment.deleteReason && (
                          <p className="max-w-[16rem] truncate text-xs text-red-600 dark:text-red-400">{payment.deleteReason}</p>
                        )}
                      </TD>
                      {canDelete && (
                        <TD className="text-right">
                          {payment.isDeleted ? (
                            <span className="text-xs text-fg-subtle">—</span>
                          ) : (
                            <ActionMenu
                              label={`${payment.code} amallari`}
                              items={[
                                {
                                  label: 'To‘lovni bekor qilish',
                                  icon: Ban,
                                  tone: 'danger',
                                  onSelect: () => setDialog({ type: 'cancel', payment }),
                                },
                              ]}
                            />
                          )}
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Pagination
              page={paymentsQuery.data.meta.page}
              totalPages={paymentsQuery.data.meta.totalPages}
              total={paymentsQuery.data.meta.total}
              limit={paymentsQuery.data.meta.limit}
              onPageChange={setPage}
              disabled={paymentsQuery.isFetching}
            />
          </>
        )}
      </Card>

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
    </>
  );
}
