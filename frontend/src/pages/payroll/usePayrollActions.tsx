import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Calculator, Coins, FileSearch, HandCoins, LockOpen, Pencil, Percent, Send, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ActionMenuItem } from '@/components/ui/ActionMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { CommissionDetailModal } from '@/pages/teachers/CommissionDetailModal';
import { PayrollAdjustmentsModal } from '@/pages/teachers/PayrollAdjustmentsModal';
import { SalaryPaymentModal } from '@/pages/teachers/SalaryPaymentModal';
import { UnlockSalaryModal } from '@/pages/teachers/UnlockSalaryModal';
import { salaryService } from '@/services/salary.service';
import type { SalaryPeriod } from '@/types/teacher';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { RejectSalaryModal } from './RejectSalaryModal';
import { payrollProfileUrl } from './payrollUtils';

type Dialog =
  | { type: 'commission' | 'adjust' | 'pay' | 'advance' | 'unlock' | 'approve' | 'reject'; period: SalaryPeriod }
  | null;

/**
 * Maosh davri amallari — ro'yxat va xodim profili bir xil oynalar va ruxsatlardan foydalanadi.
 * Oqim: Hisoblandi → (yuborish) Ko'rib chiqilmoqda → (tasdiqlash | rad etish) → To'lov.
 */
export function usePayrollActions(options: { showProfileLink?: boolean } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canCalculate = usePermission(PERMISSIONS.SALARY_CALCULATE);
  const canApprove = usePermission(PERMISSIONS.SALARY_APPROVE);
  const canPay = usePermission(PERMISSIONS.SALARY_PAY);
  const canUnlock = usePermission(PERMISSIONS.SALARY_UNLOCK);
  const [dialog, setDialog] = useState<Dialog>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.salaries.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.teachers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.commissions.all });
  };
  const done = () => {
    setDialog(null);
    refresh();
  };
  const onError = (error: unknown) => toast.error(getErrorMessage(error));

  const calculate = useMutation({
    mutationFn: (input: { year: number; month: number; teacherProfileId?: string; employeeId?: string }) => salaryService.calculate(input),
    onSuccess: (result) => {
      toast.success(result.message);
      for (const skipped of result.data.skipped) toast.warning(`${skipped.firstName} ${skipped.lastName}: ${skipped.reason}`);
      refresh();
    },
    onError,
  });
  const submit = useMutation({
    mutationFn: (periodId: string) => salaryService.submit(periodId),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError,
  });
  const approve = useMutation({
    mutationFn: (periodId: string) => salaryService.approve(periodId),
    onSuccess: (result) => {
      toast.success(result.message);
      done();
    },
    onError,
  });

  const recalculate = (period: SalaryPeriod) =>
    calculate.mutate({
      year: period.year,
      month: period.month,
      ...(period.payee.type === 'TEACHER' ? { teacherProfileId: period.payee.id } : { employeeId: period.payee.id }),
    });

  /** Davr holati va ruxsatga mos amallar (eng kerakli birinchi) */
  const itemsFor = (period: SalaryPeriod): ActionMenuItem[] => {
    const locked = period.lockedAt !== null;
    const salaryPaid = period.payments.some((payment) => payment.kind === 'SALARY');
    const open = (type: NonNullable<Dialog>['type']) => () => setDialog({ type, period });
    return [
      ...(options.showProfileLink
        ? [{ label: 'Hisobni ko‘rish', icon: FileSearch, onSelect: () => void navigate(payrollProfileUrl(period.payee.type, period.payee.id, period)) }]
        : []),
      ...(canApprove && period.status === 'UNDER_REVIEW' ? [{ label: 'Tasdiqlash', icon: BadgeCheck, onSelect: open('approve') }] : []),
      ...(canApprove && period.status === 'UNDER_REVIEW' ? [{ label: 'Rad etish', icon: Undo2, tone: 'danger' as const, onSelect: open('reject') }] : []),
      ...(canCalculate && period.status === 'CALCULATED' ? [{ label: 'Tasdiqlashga yuborish', icon: Send, onSelect: () => submit.mutate(period.id) }] : []),
      ...(canPay && (period.status === 'APPROVED' || period.status === 'PARTIALLY_PAID') ? [{ label: 'To‘lov qilish', icon: HandCoins, onSelect: open('pay') }] : []),
      ...(period.payee.type === 'TEACHER' ? [{ label: 'Foiz tafsiloti', icon: Percent, onSelect: open('commission') }] : []),
      { label: canCalculate && !locked ? 'Bonus / jarima' : 'Bonus va jarimalar', icon: Pencil, onSelect: open('adjust') },
      ...(canCalculate && !locked ? [{ label: 'Qayta hisoblash', icon: Calculator, onSelect: () => recalculate(period) }] : []),
      ...(canPay && !locked && (period.status === 'CALCULATED' || period.status === 'UNDER_REVIEW') && period.remainingAmount > 0
        ? [{ label: 'Avans berish', icon: Coins, onSelect: open('advance') }]
        : []),
      ...(canUnlock && locked && !salaryPaid ? [{ label: 'Qayta ochish', icon: LockOpen, tone: 'danger' as const, onSelect: open('unlock') }] : []),
    ];
  };

  const dialogs: ReactNode = (
    <>
      {dialog?.type === 'commission' && (
        <CommissionDetailModal
          teacherProfileId={dialog.period.payee.id}
          teacherName={`${dialog.period.payee.firstName} ${dialog.period.payee.lastName}`}
          year={dialog.period.year}
          month={dialog.period.month}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'adjust' && <PayrollAdjustmentsModal period={dialog.period} canEdit={canCalculate} onClose={() => setDialog(null)} onChanged={refresh} />}
      {dialog?.type === 'pay' && <SalaryPaymentModal period={dialog.period} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'advance' && <SalaryPaymentModal period={dialog.period} kind="ADVANCE" onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'unlock' && <UnlockSalaryModal period={dialog.period} onClose={() => setDialog(null)} onSaved={done} />}
      {dialog?.type === 'reject' && <RejectSalaryModal period={dialog.period} onClose={() => setDialog(null)} onSaved={done} />}
      <ConfirmDialog
        open={dialog?.type === 'approve'}
        title="Maoshni tasdiqlash"
        description={
          dialog?.type === 'approve' ? (
            <>
              {dialog.period.payee.firstName} {dialog.period.payee.lastName} uchun {dialog.period.label} maoshi{' '}
              <strong>{formatMoney(dialog.period.totalAmount)}</strong>. Tasdiqlangandan keyin hisob qotiriladi — bonus, jarima va qayta
              hisoblash faqat “Qayta ochish” ruxsati bilan mumkin bo‘ladi. Tasdiq pul o‘tkazmaydi: to‘lov alohida qayd etiladi.
              {dialog.period.warnings.length > 0 && <> Hisobda {dialog.period.warnings.length} ta ogohlantirish bor.</>}
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

  return {
    itemsFor,
    dialogs,
    calculate,
    submit,
    recalculate,
    openDialog: (type: NonNullable<Dialog>['type'], period: SalaryPeriod) => setDialog({ type, period }),
    refresh,
    can: { calculate: canCalculate, approve: canApprove, pay: canPay, unlock: canUnlock },
  };
}
