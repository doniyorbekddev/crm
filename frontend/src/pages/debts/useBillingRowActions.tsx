import { useQueryClient } from '@tanstack/react-query';
import { History, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { StudentItem } from '@/types/student';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { PaymentFormModal } from '../payments/PaymentFormModal';
import { StudentBillingHistoryModal } from './StudentBillingHistoryModal';

/** Qarzdorlik qatoridagi amallar: to'lov qabul qilish va qarz tarixi (oynalar bilan) */
export function useBillingRowActions() {
  const queryClient = useQueryClient();
  const canCreatePayment = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const [payFor, setPayFor] = useState<StudentItem | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [loadingStudentId, setLoadingStudentId] = useState<string | null>(null);

  const openPayment = async (studentId: string) => {
    setLoadingStudentId(studentId);
    try {
      setPayFor(await studentsService.getById(studentId));
    } finally {
      setLoadingStudentId(null);
    }
  };

  const actions = (studentId: string, canPay: boolean) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" leftIcon={<History className="size-4" aria-hidden />} onClick={() => setHistoryFor(studentId)}>
        Tarix
      </Button>
      {canCreatePayment && (
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Wallet className="size-4" aria-hidden />}
          loading={loadingStudentId === studentId}
          disabled={!canPay}
          onClick={() => void openPayment(studentId)}
        >
          To‘lov
        </Button>
      )}
    </div>
  );

  const modals = (
    <>
      {payFor && (
        <PaymentFormModal
          student={payFor}
          onClose={() => setPayFor(null)}
          onSaved={() => {
            setPayFor(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.payments.all });
            void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
          }}
        />
      )}
      {historyFor && <StudentBillingHistoryModal studentId={historyFor} onClose={() => setHistoryFor(null)} />}
    </>
  );

  return { actions, modals };
}
