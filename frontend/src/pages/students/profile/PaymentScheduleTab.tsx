import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentScheduleService } from '@/services/paymentSchedule.service';
import type { PaymentSchedule } from '@/types/paymentSchedule';
import { formatDate, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { INSTALLMENT_STATUS_LABELS, INSTALLMENT_STATUS_TONES } from '@/utils/scheduleLabels';

const MAX_INSTALLMENTS = 36;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-01-31" + 1 oy → "2026-02-28" (server bilan bir xil qoida) */
function addMonthsClamped(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 text-base font-semibold break-words sm:text-lg',
          tone === 'bad' ? 'text-red-600 dark:text-red-400' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
    </Card>
  );
}

export function PaymentScheduleTab({ studentId, startDate }: { studentId: string; startDate: string }) {
  const canManage = usePermission(PERMISSIONS.PAYMENT_CREATE);
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'generate' | 'edit' | null>(null);

  const query = useQuery({
    queryKey: queryKeys.students.paymentSchedule(studentId),
    queryFn: () => paymentScheduleService.get(studentId),
  });

  const onSaved = (schedule: PaymentSchedule) => {
    queryClient.setQueryData(queryKeys.students.paymentSchedule(studentId), schedule);
    void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
    setDialog(null);
  };

  if (query.isPending) {
    return (
      <Card>
        <TableSkeleton rows={4} columns={6} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const schedule = query.data;
  const hasSchedule = schedule.installments.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Shartnoma" value={formatMoney(schedule.contractTotal)} hint={`To‘langan: ${formatMoney(schedule.paid)}`} />
        <Tile label="Bugungacha reja" value={formatMoney(schedule.dueToDate)} hint="jadval bo‘yicha to‘lanishi kerak" />
        <Tile
          label="Muddati o‘tgan"
          value={formatMoney(schedule.overdueAmount)}
          hint={schedule.overdueAmount > 0 ? `${schedule.overdueDays} kun kechikdi` : 'Kechikish yo‘q'}
          tone={schedule.overdueAmount > 0 ? 'bad' : hasSchedule ? 'good' : undefined}
        />
        <Tile
          label="Keyingi to‘lov"
          value={schedule.nextDue ? formatMoney(schedule.nextDue.amount) : '—'}
          hint={schedule.nextDue ? formatDate(schedule.nextDue.dueDate) : hasSchedule ? 'Hammasi to‘langan' : 'Jadval tuzilmagan'}
        />
      </div>

      {schedule.mismatch && (
        <Alert tone="warning" title="Jadval shartnomaga mos emas">
          Jadval yig‘indisi {formatMoney(schedule.scheduledTotal)}, shartnoma summasi esa {formatMoney(schedule.contractTotal)}.{' '}
          {canManage ? 'Jadvalni qayta tuzing yoki tahrirlang.' : 'Buxgalterga murojaat qiling.'}
        </Alert>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <p className="text-sm font-medium text-fg">
            To‘lov jadvali
            {hasSchedule && <span className="ml-1 font-normal text-fg-muted">· {schedule.installments.length} ta qism</span>}
          </p>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {hasSchedule && (
                <Button size="sm" variant="secondary" leftIcon={<Pencil className="size-4" aria-hidden />} onClick={() => setDialog('edit')}>
                  Tahrirlash
                </Button>
              )}
              <Button
                size="sm"
                variant={hasSchedule ? 'secondary' : 'primary'}
                leftIcon={<RefreshCw className="size-4" aria-hidden />}
                onClick={() => setDialog('generate')}
              >
                {hasSchedule ? 'Qayta tuzish' : 'Jadval tuzish'}
              </Button>
            </div>
          )}
        </div>

        {!hasSchedule ? (
          <EmptyState
            icon={CalendarClock}
            title="To‘lov jadvali tuzilmagan"
            description={canManage ? 'Shartnoma summasini oylik qismlarga bo‘lib, muddatlarni belgilang' : 'Jadvalni buxgalter tuzadi'}
          />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">№</TH>
                  <TH>Muddat</TH>
                  <TH>Summa</TH>
                  <TH>To‘langan</TH>
                  <TH>Qolgan</TH>
                  <TH>Holat</TH>
                </tr>
              </THead>
              <TBody>
                {schedule.installments.map((item) => (
                  <TR key={item.id} className={cn(item.status === 'PAID' && 'opacity-70')}>
                    <TD className="text-fg-muted tabular-nums">{item.sequence}</TD>
                    <TD className="whitespace-nowrap">
                      <p className="text-fg">{formatDate(item.dueDate)}</p>
                      {item.note && <p className="max-w-56 truncate text-xs text-fg-muted">{item.note}</p>}
                    </TD>
                    <TD className="font-medium whitespace-nowrap text-fg">{formatMoney(item.amount)}</TD>
                    <TD className="whitespace-nowrap text-fg-muted">{formatMoney(item.paid)}</TD>
                    <TD
                      className={cn(
                        'whitespace-nowrap',
                        item.status === 'OVERDUE' ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg',
                      )}
                    >
                      {formatMoney(item.remaining)}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Badge tone={INSTALLMENT_STATUS_TONES[item.status]}>{INSTALLMENT_STATUS_LABELS[item.status]}</Badge>
                      {item.status === 'OVERDUE' && (
                        <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{item.overdueDays} kun kechikdi</p>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {dialog === 'generate' && (
        <GenerateScheduleModal
          studentId={studentId}
          contractTotal={schedule.contractTotal}
          defaultCount={schedule.installments.length || 6}
          defaultDate={schedule.installments[0]?.dueDate ?? startDate}
          replacing={hasSchedule}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}
      {dialog === 'edit' && <EditScheduleModal studentId={studentId} schedule={schedule} onClose={() => setDialog(null)} onSaved={onSaved} />}
    </div>
  );
}

interface GenerateScheduleModalProps {
  studentId: string;
  contractTotal: number;
  defaultCount: number;
  defaultDate: string;
  replacing: boolean;
  onClose: () => void;
  onSaved: (schedule: PaymentSchedule) => void;
}

function GenerateScheduleModal({ studentId, contractTotal, defaultCount, defaultDate, replacing, onClose, onSaved }: GenerateScheduleModalProps) {
  const [count, setCount] = useState(String(defaultCount));
  const [firstDueDate, setFirstDueDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);

  const parsedCount = Number(count);
  const valid = Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= MAX_INSTALLMENTS && DATE_PATTERN.test(firstDueDate);
  const perInstallment = valid ? Math.floor(contractTotal / parsedCount / 1000) * 1000 : 0;

  const save = useMutation({
    mutationFn: () => paymentScheduleService.generate(studentId, { count: parsedCount, firstDueDate }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved(result.data);
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title={replacing ? 'Jadvalni qayta tuzish' : 'To‘lov jadvali tuzish'}
      description={`Shartnoma summasi: ${formatMoney(contractTotal)}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button
            loading={save.isPending}
            disabled={!valid}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            Tuzish
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {replacing && (
        <Alert tone="warning" className="mb-4">
          Mavjud jadval yangisi bilan almashtiriladi. Qabul qilingan to‘lovlar o‘zgarmaydi — ular yangi qismlarga qayta taqsimlanadi.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Qismlar soni" htmlFor="schedule-count" hint={`Oylik, 1 dan ${MAX_INSTALLMENTS} gacha`} required>
          <Input id="schedule-count" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value.replace(/\D/g, ''))} />
        </FormField>
        <FormField label="Birinchi to‘lov sanasi" htmlFor="schedule-first-date" required>
          <Input id="schedule-first-date" type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} />
        </FormField>
      </div>
      {valid && perInstallment > 0 && (
        <p className="mt-3 text-sm text-fg-muted">
          Har oy taxminan {formatMoney(perInstallment)} — yuvarlashdan qolgan farq oxirgi qismga qo‘shiladi.
        </p>
      )}
    </Modal>
  );
}

interface EditableRow {
  key: string;
  dueDate: string;
  amount: string;
  note: string;
}

interface EditScheduleModalProps {
  studentId: string;
  schedule: PaymentSchedule;
  onClose: () => void;
  onSaved: (schedule: PaymentSchedule) => void;
}

function EditScheduleModal({ studentId, schedule, onClose, onSaved }: EditScheduleModalProps) {
  const [rows, setRows] = useState<EditableRow[]>(() =>
    schedule.installments.map((item) => ({ key: item.id, dueDate: item.dueDate, amount: String(item.amount), note: item.note ?? '' })),
  );
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const difference = schedule.contractTotal - total;
  const ordered = rows.every((row, index) => index === 0 || (rows[index - 1]?.dueDate ?? '') <= row.dueDate);
  const complete = rows.length > 0 && rows.every((row) => DATE_PATTERN.test(row.dueDate) && Number(row.amount) >= 1000);
  const canSave = complete && ordered && difference === 0 && rows.length <= MAX_INSTALLMENTS;

  const update = (key: string, patch: Partial<EditableRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    const last = rows.at(-1);
    setRows((current) => [
      ...current,
      {
        key: `new-${nextKey}`,
        dueDate: last && DATE_PATTERN.test(last.dueDate) ? addMonthsClamped(last.dueDate, 1) : schedule.installments[0]?.dueDate ?? '',
        amount: difference > 0 ? String(difference) : '',
        note: '',
      },
    ]);
    setNextKey((value) => value + 1);
  };

  const save = useMutation({
    mutationFn: () =>
      paymentScheduleService.replace(studentId, {
        installments: rows.map((row) => ({
          dueDate: row.dueDate,
          amount: Number(row.amount),
          ...(row.note.trim() ? { note: row.note.trim() } : {}),
        })),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved(result.data);
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title="To‘lov jadvalini tahrirlash"
      description={`Qismlar yig‘indisi shartnoma summasiga (${formatMoney(schedule.contractTotal)}) teng bo‘lishi kerak`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button
            loading={save.isPending}
            disabled={!canSave}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            Saqlash
          </Button>
        </>
      }
    >
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-fg">{index + 1}-qism</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`${index + 1}-qismni o‘chirish`}
                disabled={rows.length === 1 || save.isPending}
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="date"
                aria-label={`${index + 1}-qism muddati`}
                value={row.dueDate}
                onChange={(event) => update(row.key, { dueDate: event.target.value })}
              />
              <Input
                inputMode="numeric"
                aria-label={`${index + 1}-qism summasi`}
                placeholder="Summa (so‘m)"
                value={row.amount}
                onChange={(event) => update(row.key, { amount: event.target.value.replace(/\D/g, '') })}
              />
              <Input
                className="sm:col-span-2"
                aria-label={`${index + 1}-qism izohi`}
                placeholder="Izoh (ixtiyoriy)"
                maxLength={255}
                value={row.note}
                onChange={(event) => update(row.key, { note: event.target.value })}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Plus className="size-4" aria-hidden />}
          disabled={rows.length >= MAX_INSTALLMENTS || save.isPending}
          onClick={addRow}
        >
          Qism qo‘shish
        </Button>
        <div className="text-right text-sm">
          <p className="text-fg">Jami: {formatMoney(total)}</p>
          {difference > 0 && <p className="text-amber-600 dark:text-amber-400">Yana {formatMoney(difference)} taqsimlash kerak</p>}
          {difference < 0 && <p className="text-red-600 dark:text-red-400">Shartnomadan {formatMoney(-difference)} ortiq</p>}
          {!ordered && <p className="text-red-600 dark:text-red-400">Muddatlar o‘sib boruvchi tartibda bo‘lsin</p>}
        </div>
      </div>
    </Modal>
  );
}
