import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Calculator, HandCoins, Pencil, Percent, Wallet2 } from 'lucide-react';
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
import type { SalaryPeriod, SalaryPeriodParams, SalaryPeriodStatus } from '@/types/teacher';
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
import { SalaryAdjustModal } from './SalaryAdjustModal';
import { SalaryPaymentModal } from './SalaryPaymentModal';
import { ExportMenu } from '@/components/ExportMenu';
import { useExport } from '@/hooks/useExport';

const now = new Date();

/** Joriy yildan 3 yil oldingacha */
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

type Dialog =
  | { type: 'commission'; period: SalaryPeriod }
  | { type: 'adjust'; period: SalaryPeriod }
  | { type: 'pay'; period: SalaryPeriod }
  | { type: 'approve'; period: SalaryPeriod }
  | null;

export default function SalariesPage() {
  const queryClient = useQueryClient();
  const canCalculate = usePermission(PERMISSIONS.SALARY_CALCULATE);
  const canApprove = usePermission(PERMISSIONS.SALARY_APPROVE);
  const canPay = usePermission(PERMISSIONS.SALARY_PAY);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [status, setStatus] = useState<SalaryPeriodStatus | ''>('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();

  const params: SalaryPeriodParams = { year, month, ...(status ? { status } : {}) };
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
    mutationFn: (teacherProfileId?: string) =>
      salaryService.calculate({ year, month, ...(teacherProfileId ? { teacherProfileId } : {}) }),
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

  const rowActions = (period: SalaryPeriod) => [
    { label: 'Foiz tafsiloti', icon: Percent, onSelect: () => setDialog({ type: 'commission', period }) },
    ...(canCalculate && !period.lockedAt
      ? [
          {
            label: 'Qayta hisoblash',
            icon: Calculator,
            onSelect: () => calculate.mutate(period.teacher.profileId),
          },
          { label: 'Bonus / jarima', icon: Pencil, onSelect: () => setDialog({ type: 'adjust', period }) },
        ]
      : []),
    ...(canApprove && period.status === 'CALCULATED'
      ? [{ label: 'Tasdiqlash', icon: BadgeCheck, onSelect: () => setDialog({ type: 'approve', period }) }]
      : []),
    ...(canPay && (period.status === 'APPROVED' || period.status === 'PARTIALLY_PAID')
      ? [{ label: 'To‘lov qilish', icon: HandCoins, onSelect: () => setDialog({ type: 'pay', period }) }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="O‘qituvchi maoshlari"
        description="Oylik hisob-kitob, tasdiqlash va to‘lovlar"
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
          <TableSkeleton rows={6} columns={6} />
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
                  <TH>Model</TH>
                  <TH className="text-right">Yuklama</TH>
                  <TH className="text-right">Hisoblangan</TH>
                  <TH className="text-right">To‘langan</TH>
                  <TH>Holat</TH>
                  <TH className="w-12">
                    <span className="sr-only">Amallar</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {periods.map((period) => {
                  const actions = rowActions(period);
                  return (
                    <TR key={period.id}>
                      <TD>
                        <p className="font-medium text-fg">
                          {period.teacher.firstName} {period.teacher.lastName}
                        </p>
                        <p className="text-xs text-fg-muted">{period.teacher.specialization ?? '—'}</p>
                      </TD>
                      <TD>
                        <Badge tone="blue">{SALARY_TYPE_LABELS[period.salaryType]}</Badge>
                        {(period.bonus > 0 || period.penalty > 0) && (
                          <p className="mt-1 text-xs text-fg-muted">
                            {period.bonus > 0 && `+${formatMoney(period.bonus)}`}
                            {period.bonus > 0 && period.penalty > 0 && ' · '}
                            {period.penalty > 0 && `−${formatMoney(period.penalty)}`}
                          </p>
                        )}
                      </TD>
                      <TD className="text-right text-xs whitespace-nowrap text-fg-muted">
                        {formatNumber(period.lessonsCount)} dars · {formatNumber(period.studentsCount)} o‘quvchi
                        {(period.percentageAmount !== 0 || period.groupRevenue > 0) && (
                          <p className="text-fg-subtle">
                            tushum {formatMoney(period.groupRevenue)}
                            {period.percentageAmount !== 0 && ` · foiz ${formatMoney(period.percentageAmount)}`}
                          </p>
                        )}
                      </TD>
                      <TD className="text-right font-medium whitespace-nowrap text-fg">{formatMoney(period.totalAmount)}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <span className="text-fg-muted">{formatMoney(period.paidAmount)}</span>
                        {period.remainingAmount > 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            qolgan {formatMoney(period.remainingAmount)}
                          </p>
                        )}
                      </TD>
                      <TD>
                        <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                      </TD>
                      <TD className="text-right">
                        {actions.length > 0 ? (
                          <ActionMenu
                            label={`${period.teacher.firstName} ${period.teacher.lastName} maoshi amallari`}
                            items={actions}
                          />
                        ) : (
                          <span className="text-xs text-fg-subtle">—</span>
                        )}
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
          teacherProfileId={dialog.period.teacher.profileId}
          teacherName={`${dialog.period.teacher.firstName} ${dialog.period.teacher.lastName}`}
          year={dialog.period.year}
          month={dialog.period.month}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.type === 'adjust' && (
        <SalaryAdjustModal
          period={dialog.period}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
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

      <ConfirmDialog
        open={dialog?.type === 'approve'}
        title="Maoshni tasdiqlash"
        description={
          dialog?.type === 'approve' ? (
            <>
              {dialog.period.teacher.firstName} {dialog.period.teacher.lastName} uchun {dialog.period.label} maoshi{' '}
              <strong>{formatMoney(dialog.period.totalAmount)}</strong>. Tasdiqlangandan keyin hisob qotiriladi — bonus,
              jarima va qayta hisoblash mumkin bo‘lmaydi.
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
