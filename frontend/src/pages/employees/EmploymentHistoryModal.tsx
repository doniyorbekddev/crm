import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import type { Employee } from '@/types/employee';
import type { EmploymentHistoryEntry } from '@/types/org';
import { formatDate } from '@/utils/format';
import { personName } from '@/utils/orgLabels';

const TYPE_LABELS: Record<EmploymentHistoryEntry['type'], string> = {
  HIRED: 'Ishga olindi',
  POSITION_CHANGED: 'Lavozim o‘zgardi',
  DEPARTMENT_CHANGED: 'Bo‘lim o‘zgardi',
  PROMOTED: 'Lavozimga ko‘tarildi',
  STATUS_CHANGED: 'Holat o‘zgardi',
  TERMINATED: 'Ishdan ketdi',
};

/** Ish tarixi: lavozim, bo'lim va holat o'zgarishlari — sababi va kim kiritgani bilan (o'zgarmas) */
export function EmploymentHistoryModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const query = useQuery({ queryKey: queryKeys.org.history(employee.id), queryFn: () => orgService.employeeHistory(employee.id) });
  return (
    <Modal open title="Ish tarixi" description={`${employee.firstName} ${employee.lastName}`} onClose={onClose}>
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="text-body text-fg-muted">Tarix hali yozilmagan (yozuvlar o‘zgarishlardan boshlab yuritiladi).</p>
      ) : (
        <ol className="space-y-3">
          {query.data.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-3">
              <p className="font-medium text-fg">
                {formatDate(entry.effectiveDate)} · {TYPE_LABELS[entry.type]}
              </p>
              <p className="text-body text-fg-muted">
                {entry.positionTitle}
                {entry.department ? ` · ${entry.department}` : ''}
              </p>
              {entry.changeReason && <p className="text-caption text-fg-muted">Sabab: {entry.changeReason}</p>}
              <p className="text-caption text-fg-subtle">Kiritdi: {personName(entry.createdBy)}</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
