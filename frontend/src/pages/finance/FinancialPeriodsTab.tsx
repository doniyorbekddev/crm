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
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
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
          <p className="text-sm font-medium text-fg">Moliyaviy oylar</p>
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
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH>Oy</TH>
                  <TH>Holat</TH>
                  <TH className="text-right">Tushum</TH>
                  <TH className="text-right">Xarajat</TH>
                  <TH className="text-right">Qaytarishlar</TH>
                  <TH className="text-right">Sof natija</TH>
                  <TH>Yopilgan</TH>
                  <TH className="w-32">
                    <span className="sr-only">Amallar</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {query.data.map((period) => (
                  <TR key={period.month} className={cn(period.isCurrent && 'bg-brand-50/50 dark:bg-brand-950/30')}>
                    <TD className="font-medium whitespace-nowrap text-fg">
                      {period.label}
                      {period.isCurrent && <span className="ml-2 text-xs text-fg-muted">joriy</span>}
                    </TD>
                    <TD>
                      <Badge tone={period.status === 'CLOSED' ? 'gray' : 'green'}>
                        {period.status === 'CLOSED' ? 'Yopilgan' : 'Ochiq'}
                      </Badge>
                      {period.status === 'OPEN' && period.reopenedAt && (
                        <p className="mt-1 max-w-[12rem] truncate text-xs text-amber-600 dark:text-amber-400" title={period.reopenReason ?? ''}>
                          qayta ochilgan
                        </p>
                      )}
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(period.totals.income)}</TD>
                    <TD className="text-right whitespace-nowrap tabular-nums text-fg">{formatMoney(period.totals.expense)}</TD>
                    <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{formatMoney(period.totals.refunds)}</TD>
                    <TD
                      className={cn(
                        'text-right font-medium whitespace-nowrap tabular-nums',
                        period.totals.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {formatMoney(period.totals.net)}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-fg-muted">
                      {period.closedAt && period.status === 'CLOSED'
                        ? `${formatDateTime(period.closedAt)} · ${period.closedBy ? `${period.closedBy.firstName} ${period.closedBy.lastName}` : '—'}`
                        : '—'}
                    </TD>
                    <TD className="text-right">
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
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
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
