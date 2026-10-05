import { DataTable } from '@/components/ui/DataTable';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { FinancialPeriod } from '@/types/finance';
import { formatDateTime, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const thisYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => thisYear - index);

/** Moliyaviy oylar: yopilgan oyga pul yozuvi qo‘shilmaydi va bekor qilinmaydi */
export function FinancialPeriodsTab() {
  const queryClient = useQueryClient();
  const canClose = usePermission(PERMISSIONS.FINANCE_CLOSE);
  const canReopen = usePermission(PERMISSIONS.FINANCE_REOPEN);
  const [year, setYear] = useState(thisYear);
  const [closing, setClosing] = useState<FinancialPeriod | null>(null);
  const [reopening, setReopening] = useState<FinancialPeriod | null>(null);
  const [reason, setReason] = useState('');

  const query = useQuery({ queryKey: queryKeys.finance.periods(year), queryFn: () => financeService.periods(year) });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });

  const close = useMutation({
    mutationFn: (period: FinancialPeriod) => financeService.closePeriod({ year: period.year, month: period.month }),
    onSuccess: (result) => {
      toast.success(result.message);
      setClosing(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reopen = useMutation({
    mutationFn: (period: FinancialPeriod) => financeService.reopenPeriod({ year: period.year, month: period.month, reason: reason.trim() }),
    onSuccess: (result) => {
      toast.success(result.message);
      setReopening(null);
      setReason('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Yopilgan oy sanasi bilan to‘lov, tushum, xarajat, o‘tkazma va maosh to‘lovi qo‘shilmaydi, bekor ham qilinmaydi. Xato bo‘lsa, tuzatish
        ochiq oyda kiritiladi (pulni qaytarish, yangi xarajat).
      </Alert>

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <p className="text-label text-fg">Moliyaviy oylar</p>
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Yil" wrapperClassName="w-28">
            {YEAR_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            bare
            label="Moliyaviy oylar"
            rows={query.data}
            rowKey={(period) => String(period.month)}
            rowClassName={(period) => cn(period.isCurrent && 'bg-primary-subtle')}
            mobileLayout="cards"
            columns={[
              {
                key: 'c0',
                label: 'Oy',
                tdClassName: 'font-medium whitespace-nowrap text-fg',
                cell: (period) => (
                  <>
                    {period.label}
                    {period.isCurrent && <span className="ml-2 text-caption text-fg-muted">joriy</span>}
                  </>
                ),
              },
              {
                key: 'c1',
                label: 'Holat',
                cell: (period) => (
                  <>
                    <Badge tone={period.status === 'CLOSED' ? 'gray' : 'green'}>
                      {period.status === 'CLOSED' ? 'Yopilgan' : 'Ochiq'}
                    </Badge>
                    {period.status === 'OPEN' && period.reopenedAt && (
                      <Tooltip content={period.reopenReason ?? ''} describe={false} disabled={!period.reopenReason} wrapperClassName="mt-1 block">
                        <span className="block text-caption text-warning">
                          qayta ochilgan
                          {period.reopenReason && <span className="sr-only">: {period.reopenReason}</span>}
                        </span>
                      </Tooltip>
                    )}
                  </>
                ),
              },
              {
                key: 'c2',
                label: 'Tushum',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg',
                cell: (period) => <>{formatMoney(period.totals.income)}</>,
              },
              {
                key: 'c3',
                label: 'Xarajat',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg',
                cell: (period) => <>{formatMoney(period.totals.expense)}</>,
              },
              {
                key: 'c4',
                label: 'Qaytarishlar',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg-muted',
                cell: (period) => <>{formatMoney(period.totals.refunds)}</>,
              },
              {
                key: 'c5',
                label: 'Sof natija',
                thClassName: 'text-right',
                tdClassName: (period) => cn( 'text-right font-medium whitespace-nowrap tabular-nums', period.totals.net < 0 ? 'text-danger' : 'text-success', ),
                cell: (period) => (
                  <>
                    {formatMoney(period.totals.net)}
                  </>
                ),
              },
              {
                key: 'c6',
                label: 'Yopilgan',
                tdClassName: 'text-caption whitespace-nowrap text-fg-muted',
                cell: (period) => (
                  <>
                    {period.closedAt && period.status === 'CLOSED'
                      ? `${formatDateTime(period.closedAt)} · ${period.closedBy ? `${period.closedBy.firstName} ${period.closedBy.lastName}` : '—'}`
                      : '—'}
                  </>
                ),
              },
              {
                key: 'c7',
                label: 'Amallar',
                header: <span className="sr-only">Amallar</span>,
                fixed: true,
                thClassName: 'w-32',
                tdClassName: 'text-right',
                cell: (period) => (
                  <>
                    {period.canClose && canClose && (
                      <Button size="sm" variant="secondary" leftIcon={<Lock className="size-4" aria-hidden />} onClick={() => setClosing(period)}>
                        Yopish
                      </Button>
                    )}
                    {period.status === 'CLOSED' && canReopen && (
                      <Button size="sm" variant="ghost" leftIcon={<LockOpen className="size-4" aria-hidden />} onClick={() => setReopening(period)}>
                        Ochish
                      </Button>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
      </Card>

      <ConfirmDialog
        open={closing !== null}
        title="Moliyaviy oyni yopish"
        tone="primary"
        description={
          closing ? (
            <>
              {closing.label} yopiladi: tushum {formatMoney(closing.totals.income)}, xarajat {formatMoney(closing.totals.expense)}, sof natija{' '}
              <strong>{formatMoney(closing.totals.net)}</strong>. Shundan keyin bu oy sanasi bilan pul yozuvlari o‘zgartirilmaydi.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Oyni yopish"
        loading={close.isPending}
        onConfirm={() => closing && close.mutate(closing)}
        onCancel={() => setClosing(null)}
      />

      {reopening && (
        <Modal
          open
          title="Oyni qayta ochish"
          description={reopening.label}
          onClose={() => setReopening(null)}
          closeDisabled={reopen.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReopening(null)} disabled={reopen.isPending}>
                Bekor qilish
              </Button>
              <Button variant="danger" loading={reopen.isPending} disabled={reason.trim().length < 5} onClick={() => reopen.mutate(reopening)}>
                Qayta ochish
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Alert tone="warning">Qayta ochilgan oyga yana yozuv qo‘shish va bekor qilish mumkin bo‘ladi. Amal audit jurnaliga yoziladi.</Alert>
            <FormField label="Sabab" htmlFor="reopen-reason" required>
              <Textarea id="reopen-reason" rows={3} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  );
}
