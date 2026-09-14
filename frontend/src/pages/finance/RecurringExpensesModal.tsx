import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { expensesService, recurringExpensesService } from '@/services/finance.service';
import type { ExpenseStatus } from '@/types/finance';
import { EXPENSE_STATUS_LABELS, EXPENSE_STATUS_TONES } from '@/utils/financeLabels';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

interface RecurringExpensesModalProps {
  onClose: () => void;
  /** Kutilayotgan xarajatlar yaratilganda ro‘yxatni yangilash */
  onChanged: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Takroriy xarajatlar (ijara, internet, dastur) va tasdiq chegarasi */
export function RecurringExpensesModal({ onClose, onChanged }: RecurringExpensesModalProps) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EXPENSE_MANAGE);
  const canApprove = usePermission(PERMISSIONS.EXPENSE_APPROVE);

  const listQuery = useQuery({ queryKey: queryKeys.expenses.recurring, queryFn: recurringExpensesService.list });
  const categoriesQuery = useQuery({ queryKey: queryKeys.expenses.categories, queryFn: expensesService.categories, staleTime: 60_000 });
  const settingsQuery = useQuery({ queryKey: queryKeys.expenses.approvalSettings, queryFn: expensesService.approvalSettings });

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('5');
  const [startDate, setStartDate] = useState(today);
  const [vendor, setVendor] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [threshold, setThreshold] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    onChanged();
  };
  const onFieldErrors = (error: unknown) => {
    const fields = getFieldErrors(error);
    if (fields.length > 0) setErrors(Object.fromEntries(fields.map((field) => [field.field, field.message])));
    else toast.error(getErrorMessage(error));
  };

  const create = useMutation({
    mutationFn: () =>
      recurringExpensesService.create({
        name: name.trim(),
        categoryId,
        amount: Number(amount),
        dayOfMonth: Number(dayOfMonth),
        startDate,
        ...(vendor.trim() ? { vendor: vendor.trim() } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setName('');
      setAmount('');
      setVendor('');
      setErrors({});
      refresh();
    },
    onError: onFieldErrors,
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => recurringExpensesService.update(input.id, { isActive: input.isActive }),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const generate = useMutation({
    mutationFn: recurringExpensesService.generate,
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const saveThreshold = useMutation({
    mutationFn: (value: number) => expensesService.updateApprovalSettings(value),
    onSuccess: (result) => {
      toast.success(result.message);
      setThreshold(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Nomini kiriting';
    if (!categoryId) next.categoryId = 'Kategoriyani tanlang';
    if (!/^\d{4,9}$/.test(amount) || Number(amount) < 1000) next.amount = 'Eng kam summa — 1 000 so‘m';
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 28) next.dayOfMonth = 'Kun 1 dan 28 gacha';
    if (!startDate) next.startDate = 'Boshlanish sanasini tanlang';
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  const currentThreshold = settingsQuery.data?.approvalThreshold ?? 0;

  return (
    <Modal open size="lg" title="Takroriy xarajatlar" description="Har oy kutilayotgan xarajat yaratiladi — pul avtomatik yechilmaydi" onClose={onClose}>
      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium text-fg">Tasdiq chegarasi</p>
              <p className="text-xs text-fg-muted">
                {currentThreshold > 0
                  ? `${formatMoney(currentThreshold)} va undan katta xarajat rahbar tasdig‘ini talab qiladi`
                  : 'O‘chirilgan — barcha xarajatlar darhol to‘lanadi'}
              </p>
            </div>
            {canApprove && threshold === null && (
              <Button size="sm" variant="secondary" onClick={() => setThreshold(String(currentThreshold))}>
                O‘zgartirish
              </Button>
            )}
          </div>
          {threshold !== null && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Tasdiq chegarasi (so‘m)"
                inputMode="numeric"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value.replace(/\D/g, ''))}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setThreshold(null)} disabled={saveThreshold.isPending}>
                  Yopish
                </Button>
                <Button size="sm" loading={saveThreshold.isPending} onClick={() => saveThreshold.mutate(Number(threshold || 0))}>
                  Saqlash
                </Button>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">Ro‘yxat</h3>
            {canManage && (
              <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="size-4" aria-hidden />} loading={generate.isPending} onClick={() => generate.mutate()}>
                Shu oy uchun yaratish
              </Button>
            )}
          </div>
          {listQuery.isPending ? (
            <p className="py-4 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
          ) : listQuery.isError ? (
            <Alert tone="error">{getErrorMessage(listQuery.error)}</Alert>
          ) : listQuery.data.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-fg-muted">Takroriy xarajat yo‘q</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {listQuery.data.map((item) => (
                <li key={item.id} className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm', !item.isActive && 'opacity-60')}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      {item.name}
                      {item.currentMonth && (
                        <Badge tone={EXPENSE_STATUS_TONES[item.currentMonth.status as ExpenseStatus]}>
                          {EXPENSE_STATUS_LABELS[item.currentMonth.status as ExpenseStatus]}
                        </Badge>
                      )}
                      {!item.isActive && <Badge tone="gray">To‘xtatilgan</Badge>}
                    </p>
                    <p className="text-xs text-fg-muted">
                      {item.category.name} · har oy {item.dayOfMonth}-kuni{item.vendor && ` · ${item.vendor}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold whitespace-nowrap tabular-nums text-fg">{formatMoney(item.amount)}</span>
                    {canManage && (
                      <Button size="sm" variant="ghost" loading={toggle.isPending} onClick={() => toggle.mutate({ id: item.id, isActive: !item.isActive })}>
                        {item.isActive ? 'To‘xtatish' : 'Yoqish'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {canManage && (
          <section className="space-y-3 rounded-xl border border-border p-3">
            <h3 className="text-sm font-semibold text-fg">Yangi takroriy xarajat</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Nomi" htmlFor="recurring-name" error={errors.name} required>
                <Input id="recurring-name" value={name} placeholder="Ofis ijarasi" onChange={(event) => setName(event.target.value)} />
              </FormField>
              <FormField label="Kategoriya" htmlFor="recurring-category" error={errors.categoryId} required>
                <Select id="recurring-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">Tanlang…</option>
                  {(categoriesQuery.data ?? [])
                    .filter((category) => category.isActive)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </Select>
              </FormField>
              <FormField label="Summa (so‘m)" htmlFor="recurring-amount" error={errors.amount} required>
                <Input id="recurring-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))} />
              </FormField>
              <FormField label="Oyning kuni" htmlFor="recurring-day" error={errors.dayOfMonth} required hint="1–28">
                <Input id="recurring-day" inputMode="numeric" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value.replace(/\D/g, ''))} />
              </FormField>
              <FormField label="Boshlanish sanasi" htmlFor="recurring-start" error={errors.startDate} required>
                <Input id="recurring-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </FormField>
              <FormField label="Yetkazib beruvchi" htmlFor="recurring-vendor" error={errors.vendor}>
                <Input id="recurring-vendor" value={vendor} placeholder="Uztelecom" onChange={(event) => setVendor(event.target.value)} />
              </FormField>
            </div>
            <div className="flex justify-end">
              <Button leftIcon={<Plus className="size-4" aria-hidden />} loading={create.isPending} onClick={submit}>
                Qo‘shish
              </Button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
