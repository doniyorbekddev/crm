import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Calculator, Coins, HandCoins, Lock, LockOpen, Pencil, Percent, Wallet2 } from 'lucide-react';
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
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { salaryService } from '@/services/salary.service';
import type { PayeeType, SalaryPeriod, SalaryPeriodParams, SalaryPeriodStatus } from '@/types/teacher';
import { formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import {
  MONTH_OPTIONS,
  SALARY_STATUS_LABELS,
  SALARY_STATUS_ORDER,
  SALARY_STATUS_TONES,
  SALARY_TYPE_LABELS,
} from '@/utils/teacherLabels';
import { CommissionDetailModal } from './CommissionDetailModal';
import { PayrollAdjustmentsModal } from './PayrollAdjustmentsModal';
import { SalaryPaymentModal } from './SalaryPaymentModal';
import { UnlockSalaryModal } from './UnlockSalaryModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';

const now = new Date();

/** Joriy yildan 3 yil oldingacha */
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

type Dialog =
  | { type: 'commission'; period: SalaryPeriod }
  | { type: 'adjust'; period: SalaryPeriod }
  | { type: 'pay'; period: SalaryPeriod }
  | { type: 'advance'; period: SalaryPeriod }
  | { type: 'unlock'; period: SalaryPeriod }
  | { type: 'approve'; period: SalaryPeriod }
  | null;

export default function SalariesPage() {
  const queryClient = useQueryClient();
  const canCalculate = usePermission(PERMISSIONS.SALARY_CALCULATE);
  const canApprove = usePermission(PERMISSIONS.SALARY_APPROVE);
  const canPay = usePermission(PERMISSIONS.SALARY_PAY);
  const canUnlock = usePermission(PERMISSIONS.SALARY_UNLOCK);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [status, setStatus] = useState<SalaryPeriodStatus | ''>('');
  const [payeeType, setPayeeType] = useState<PayeeType | ''>('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();

  const params: SalaryPeriodParams = { year, month, ...(status ? { status } : {}), ...(payeeType ? { payeeType } : {}) };
  const monthLabel = `${year}-${String(month).padStart(2, '0')}`;
  const monthRange = { from: `${monthLabel}-01`, to: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };

  const periodsQuery = useQuery({
    queryKey: queryKeys.salaries.periods(params),
    queryFn: () => salaryService.periods(params),
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: queryKeys.salaries.summary({ year, month }),
    queryFn: () => salaryService.summary({ year, month }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.salaries.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.commissions.all });
  };

  const calculate = useMutation({
    mutationFn: (payee?: { teacherProfileId?: string; employeeId?: string }) => salaryService.calculate({ year, month, ...payee }),
    onSuccess: (result) => {
      toast.success(result.message);
      for (const skipped of result.data.skipped) {
        toast.warning(`${skipped.firstName} ${skipped.lastName}: ${skipped.reason}`);
      }
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const approve = useMutation({
    mutationFn: (periodId: string) => salaryService.approve(periodId),
    onSuccess: (result) => {
      toast.success(result.message);
      setDialog(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const summary = summaryQuery.data;
  const periods = periodsQuery.data ?? [];

  const rowActions = (period: SalaryPeriod) => {
    const locked = period.lockedAt !== null;
    const salaryPaid = period.payments.some((payment) => payment.kind === 'SALARY');
    return [
      ...(period.payee.type === 'TEACHER'
        ? [{ label: 'Foiz tafsiloti', icon: Percent, onSelect: () => setDialog({ type: 'commission', period }) }]
        : []),
      {
        label: canCalculate && !locked ? 'Bonus / jarima' : 'Bonus va jarimalar',
        icon: Pencil,
        onSelect: () => setDialog({ type: 'adjust', period }),
      },
      ...(canCalculate && !locked
        ? [{ label: 'Qayta hisoblash', icon: Calculator, onSelect: () => calculate.mutate(period.payee.type === 'TEACHER' ? { teacherProfileId: period.payee.id } : { employeeId: period.payee.id }) }]
        : []),
      ...(canPay && !locked && period.status === 'CALCULATED' && period.remainingAmount > 0
        ? [{ label: 'Avans berish', icon: Coins, onSelect: () => setDialog({ type: 'advance', period }) }]
        : []),
      ...(canApprove && period.status === 'CALCULATED'
        ? [{ label: 'Tasdiqlash', icon: BadgeCheck, onSelect: () => setDialog({ type: 'approve', period }) }]
        : []),
      ...(canPay && (period.status === 'APPROVED' || period.status === 'PARTIALLY_PAID')
        ? [{ label: 'To‘lov qilish', icon: HandCoins, onSelect: () => setDialog({ type: 'pay', period }) }]
        : []),
      ...(canUnlock && locked && !salaryPaid
        ? [{ label: 'Qayta ochish', icon: LockOpen, tone: 'danger' as const, onSelect: () => setDialog({ type: 'unlock', period }) }]
        : []),
    ];
  };

  return (
    <>
      <PageHeader
        title="Maoshlar"
        description="O‘qituvchi va xodimlar: oylik hisob-kitob, tasdiqlash va to‘lovlar"
        documentTitle="Maoshlar"
        actions={
          <>
            {canExport && (
              <ExportMenu loading={exporting} onExport={(format) => void runExport('/reports/salaries/export', monthRange, `maoshlar-${monthLabel}`, format)} />
            )}
            {canCalculate && (
              <Button
                leftIcon={<Calculator className="size-4" aria-hidden />}
                loading={calculate.isPending}
                onClick={() => calculate.mutate(undefined)}
              >
                Oyni hisoblash
              </Button>
            )}
          </>
        }
      />

      {summary && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs text-fg-muted">{summary.label} jami</p>
            <p className="mt-1 text-xl font-semibold text-fg">{formatMoney(summary.accrued)}</p>
            <p className="mt-1 text-xs text-fg-muted">{formatNumber(summary.periods)} ta o‘qituvchi</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">To‘langan</p>
            <p className="mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(summary.paid)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Qolgan</p>
            <p className={cn('mt-1 text-xl font-semibold', summary.remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-fg')}>
              {formatMoney(summary.remaining)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-fg-muted">Tasdiq kutmoqda</p>
            <p className="mt-1 text-xl font-semibold text-fg">{formatNumber(summary.awaitingApproval)}</p>
            <p className="mt-1 text-xs text-fg-muted">hisoblangan, tasdiqlanmagan</p>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <Select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            aria-label="Oy"
            wrapperClassName="sm:w-40"
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Yil"
            wrapperClassName="sm:w-32"
          >
            {YEAR_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <div role="group" aria-label="To‘lov oluvchi" className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-lg border border-border bg-surface-muted p-0.5">
            {([
              ['', 'Hammasi'],
              ['TEACHER', 'O‘qituvchilar'],
              ['EMPLOYEE', 'Xodimlar'],
            ] as const).map(([value, label]) => (
              <button
                key={value || 'all'}
                type="button"
                aria-pressed={payeeType === value}
                onClick={() => setPayeeType(value)}
                className={cn(
                  'h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-fg',
                  payeeType === value && 'bg-surface text-fg shadow-sm',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as SalaryPeriodStatus | '')}
            aria-label="Holat"
            wrapperClassName="sm:w-48 sm:ml-auto"
          >
            <option value="">Barcha holatlar</option>
            {SALARY_STATUS_ORDER.map((item) => (
              <option key={item} value={item}>
                {SALARY_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </div>

        {periodsQuery.isPending ? (
          <TableSkeleton rows={6} columns={8} />
        ) : periodsQuery.isError ? (
          <ErrorState
            error={periodsQuery.error}
            retrying={periodsQuery.isFetching}
            onRetry={() => void periodsQuery.refetch()}
          />
        ) : periods.length === 0 ? (
          <EmptyState
            icon={Wallet2}
            title="Bu oy uchun hisob yo‘q"
            description={
              canCalculate
                ? '“Oyni hisoblash” tugmasi barcha faol o‘qituvchilar maoshini maosh modeli bo‘yicha hisoblaydi'
                : 'Maosh hisoblangandan keyin ro‘yxat shu yerda ko‘rinadi'
            }
          />
        ) : (
          <TableContainer className={cn('transition-opacity', periodsQuery.isPlaceholderData && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH>O‘qituvchi</TH>
                  <TH className="text-right">Tushum</TH>
                  <TH className="text-right">Foiz</TH>
                  <TH className="text-right">Bonus / jarima</TH>
                  <TH className="text-right">Jami</TH>
                  <TH className="text-right">To‘langan / qolgan</TH>
                  <TH>Holat</TH>
                  <TH className="w-12">
                    <span className="sr-only">Amallar</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {periods.map((period) => {
                  const actions = rowActions(period);
                  const advance = period.payments
                    .filter((payment) => payment.kind === 'ADVANCE')
                    .reduce((sum, payment) => sum + payment.amount, 0);
                  return (
                    <TR key={period.id}>
                      <TD>
                        <p className="font-medium whitespace-nowrap text-fg">
                          {period.payee.firstName} {period.payee.lastName}
                        </p>
                        <p className="text-xs text-fg-muted">
                          {period.payee.type === 'EMPLOYEE'
                            ? `Xodim · ${period.payee.subtitle ?? ''}`
                            : `${SALARY_TYPE_LABELS[period.salaryType]} · ${formatNumber(period.studentsCount)} o‘quvchi${
                                period.lessonsCount > 0 ? ` · ${formatNumber(period.lessonsCount)} dars` : ''
                              }`}
                        </p>
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">
                        {period.payee.type === 'EMPLOYEE' ? <span className="text-fg-subtle">—</span> : formatMoney(period.groupRevenue)}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <span className={cn('tabular-nums', period.percentageAmount < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                          {period.percentageAmount === 0 ? '—' : formatMoney(period.percentageAmount)}
                        </span>
                        {period.commissionRate > 0 && <p className="text-xs text-fg-subtle">{formatNumber(period.commissionRate)}%</p>}
                      </TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        {period.bonus === 0 && period.penalty === 0 ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <>
                            {period.bonus > 0 && <p className="text-emerald-600 dark:text-emerald-400">+{formatMoney(period.bonus)}</p>}
                            {period.penalty > 0 && <p className="text-red-600 dark:text-red-400">−{formatMoney(period.penalty)}</p>}
                          </>
                        )}
                      </TD>
                      <TD className="text-right font-semibold whitespace-nowrap tabular-nums text-fg">{formatMoney(period.totalAmount)}</TD>
                      <TD className="text-right whitespace-nowrap tabular-nums">
                        <p className="text-fg-muted">
                          {formatMoney(period.paidAmount)}
                          {advance > 0 && <span className="text-xs text-fg-subtle"> (avans {formatMoney(advance)})</span>}
                        </p>
                        <p className={cn('text-xs', period.remainingAmount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-fg-subtle')}>
                          qolgan {formatMoney(period.remainingAmount)}
                        </p>
                      </TD>
                      <TD>
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                          {period.lockedAt && <Lock className="size-3.5 text-fg-subtle" aria-label="Qotirilgan" />}
                        </span>
                        {!period.lockedAt && period.unlockedAt && (
                          <p className="mt-1 text-xs whitespace-nowrap text-amber-600 dark:text-amber-400">qayta ochilgan</p>
                        )}
                      </TD>
                      <TD className="text-right">
                        <ActionMenu label={`${period.payee.firstName} ${period.payee.lastName} maoshi amallari`} items={actions} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {dialog?.type === 'commission' && (
        <CommissionDetailModal
          teacherProfileId={dialog.period.payee.id}
          teacherName={`${dialog.period.payee.firstName} ${dialog.period.payee.lastName}`}
          year={dialog.period.year}
          month={dialog.period.month}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === 'adjust' && (
        <PayrollAdjustmentsModal
          period={dialog.period}
          canEdit={canCalculate}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      )}

      {dialog?.type === 'pay' && (
        <SalaryPaymentModal
          period={dialog.period}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'advance' && (
        <SalaryPaymentModal
          period={dialog.period}
          kind="ADVANCE"
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      {dialog?.type === 'unlock' && (
        <UnlockSalaryModal
          period={dialog.period}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={dialog?.type === 'approve'}
        title="Maoshni tasdiqlash"
        description={
          dialog?.type === 'approve' ? (
            <>
              {dialog.period.payee.firstName} {dialog.period.payee.lastName} uchun {dialog.period.label} maoshi{' '}
              <strong>{formatMoney(dialog.period.totalAmount)}</strong>. Tasdiqlangandan keyin hisob qotiriladi — bonus,
              jarima va qayta hisoblash faqat “Qayta ochish” ruxsati bilan mumkin bo‘ladi.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Tasdiqlash"
        loading={approve.isPending}
        onConfirm={() => dialog?.type === 'approve' && approve.mutate(dialog.period.id)}
        onCancel={() => setDialog(null)}
      />
    </>
  );
}
