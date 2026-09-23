import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { CalendarOff } from 'lucide-react';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { employeesService } from '@/services/employees.service';
import type { Employee, LeaveType } from '@/types/employee';
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_TONES, LEAVE_TYPE_LABELS, LEAVE_TYPE_ORDER } from '@/utils/employeeLabels';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

/**
 * Xodimning ta'tillari. Tasdiqlangan ta'til xodim holatini o'zgartirmaydi —
 * "bugun ta'tilda" belgisi sanalardan hisoblanadi.
 */
export function LeavesModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EMPLOYEE_MANAGE);
  const [type, setType] = useState<LeaveType>('VACATION');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const historyQuery = useQuery({
    queryKey: queryKeys.employees.employeeLeaves(employee.id),
    queryFn: () => employeesService.employeeLeaves(employee.id),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
  }

  const create = useMutation({
    mutationFn: () =>
      employeesService.createLeave({
        employeeId: employee.id,
        type,
        startDate,
        endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setStartDate('');
      setEndDate('');
      setReason('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const decide = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'APPROVED' | 'REJECTED' | 'CANCELLED'; note?: string }) =>
      employeesService.decideLeave(id, status, note),
    onSuccess: (result) => {
      toast.success(result.message);
      setRejectId(null);
      setRejectNote('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const history = historyQuery.data;
  const canSubmit = startDate !== '' && endDate !== '' && endDate >= startDate;

  return (
    <Modal
      open
      size="lg"
      title="Ta’tillar"
      description={`${employee.firstName} ${employee.lastName}${history ? ` · shu yilda ${history.approvedDaysThisYear} kun` : ''}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Yopish</Button>}
    >
      {canManage && (
        <div className="mb-4 grid gap-2 rounded-lg border border-border bg-surface-muted p-3 sm:grid-cols-5">
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-fg-muted">Turi</span>
            <Select value={type} onChange={(event) => setType(event.target.value as LeaveType)} aria-label="Ta’til turi">
              {LEAVE_TYPE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {LEAVE_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-xs text-fg-muted">Boshlanish</span>
            <Input type="date" value={startDate} aria-label="Boshlanish sanasi" onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-fg-muted">Tugash</span>
            <Input type="date" value={endDate} aria-label="Tugash sanasi" onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <label className="sm:col-span-1">
            <span className="mb-1 block text-xs text-fg-muted">Sabab</span>
            <Input value={reason} placeholder="Ixtiyoriy" aria-label="Sabab" onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={!canSubmit} loading={create.isPending} onClick={() => create.mutate()}>
              Qo‘shish
            </Button>
          </div>
        </div>
      )}

      {historyQuery.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : historyQuery.isError ? (
        <ErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} />
      ) : history && history.items.length === 0 ? (
        <EmptyState icon={CalendarOff} title="Ta’til yo‘q" description="Ta’til arizalari shu yerda ko‘rinadi" />
      ) : (
        <ul className="divide-y divide-border">
          {history?.items.map((leave) => (
            <li key={leave.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
                  {LEAVE_TYPE_LABELS[leave.type]}
                  <Badge tone={LEAVE_STATUS_TONES[leave.status]}>{LEAVE_STATUS_LABELS[leave.status]}</Badge>
                  {leave.isActiveToday && <Badge tone="yellow">Bugun ta’tilda</Badge>}
                </p>
                <p className="text-xs text-fg-subtle">
                  {formatDate(leave.startDate)} — {formatDate(leave.endDate)} · {leave.days} kun
                  {leave.reason ? ` · ${leave.reason}` : ''}
                </p>
                {leave.decidedBy && (
                  <p className="text-xs text-fg-subtle">
                    {leave.decidedBy}
                    {leave.decisionNote ? ` — ${leave.decisionNote}` : ''}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 gap-2">
                  {leave.status === 'PENDING' && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={decide.isPending && decide.variables?.id === leave.id && decide.variables.status === 'APPROVED'}
                        onClick={() => decide.mutate({ id: leave.id, status: 'APPROVED' })}
                      >
                        Tasdiqlash
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectId(leave.id)}>
                        Rad etish
                      </Button>
                    </>
                  )}
                  {leave.status === 'APPROVED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={decide.isPending && decide.variables?.id === leave.id && decide.variables.status === 'CANCELLED'}
                      onClick={() => decide.mutate({ id: leave.id, status: 'CANCELLED' })}
                    >
                      Bekor qilish
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rejectId && (
        <Modal
          open
          title="Arizani rad etish"
          description="Sabab xodimga ko‘rinadi va tarixda qoladi."
          onClose={() => setRejectId(null)}
          closeDisabled={decide.isPending}
          footer={
            <>
              <Button variant="secondary" disabled={decide.isPending} onClick={() => setRejectId(null)}>
                Yopish
              </Button>
              <Button
                variant="danger"
                disabled={rejectNote.trim().length < 3}
                loading={decide.isPending}
                onClick={() => decide.mutate({ id: rejectId, status: 'REJECTED', note: rejectNote.trim() })}
              >
                Rad etish
              </Button>
            </>
          }
        >
          <label className="block">
            <span className="mb-1 block text-sm text-fg-muted">Sabab</span>
            <Input value={rejectNote} placeholder="Nega rad etilmoqda?" onChange={(event) => setRejectNote(event.target.value)} />
          </label>
        </Modal>
      )}
    </Modal>
  );
}
