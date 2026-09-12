import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import { formatMoney } from '@/utils/format';

const schema = z
  .object({
    fromAccountId: z.string().min(1, 'Kassani tanlang'),
    toAccountId: z.string().min(1, 'Kassani tanlang'),
    amount: z.string().refine((value) => /^\d{4,9}$/.test(value) && Number(value) >= 1000, 'Eng kam summa — 1 000 so‘m'),
    description: z.string().trim().max(255, 'Izoh juda uzun'),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    path: ['toAccountId'],
    message: 'Bir xil kassa tanlangan',
  });

type FormValues = z.infer<typeof schema>;

interface TransferModalProps {
  onClose: () => void;
}

export function TransferModal({ onClose }: TransferModalProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const accountsQuery = useQuery({ queryKey: queryKeys.finance.accounts({}), queryFn: () => financeService.accounts() });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { fromAccountId: '', toAccountId: '', amount: '', description: '' },
  });

  const fromId = useWatch({ control, name: 'fromAccountId' });
  const amount = Number(useWatch({ control, name: 'amount' }) || 0);
  const accounts = (accountsQuery.data?.items ?? []).filter((account) => account.isActive);
  const from = accounts.find((account) => account.id === fromId);

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      financeService.transfer({
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amount: Number(values.amount),
        ...(values.description ? { description: values.description } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
      onClose();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['fromAccountId', 'toAccountId', 'amount'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <Modal
      open
      title="Kassalar o‘rtasida o‘tkazma"
      description="Pul bir kassadan ikkinchisiga ko‘chadi — foyda hisobiga ta’sir qilmaydi"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="transfer-form" loading={save.isPending}>
            O‘tkazish
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="transfer-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Qaysi kassadan" htmlFor="transfer-from" error={errors.fromAccountId?.message} required>
            <Select id="transfer-from" autoFocus {...register('fromAccountId')}>
              <option value="">Tanlang…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatMoney(account.balance)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Qaysi kassaga" htmlFor="transfer-to" error={errors.toAccountId?.message} required>
            <Select id="transfer-to" {...register('toAccountId')}>
              <option value="">Tanlang…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {formatMoney(account.balance)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField
          label="Summa (so‘m)"
          htmlFor="transfer-amount"
          error={errors.amount?.message}
          required
          hint={from ? `${from.name} qoldig‘i: ${formatMoney(from.balance)}` : undefined}
        >
          <Input id="transfer-amount" inputMode="numeric" invalid={Boolean(errors.amount)} {...register('amount')} />
        </FormField>

        <FormField label="Izoh" htmlFor="transfer-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Input id="transfer-description" {...register('description')} />
        </FormField>

        {from && amount > from.balance && (
          <Alert tone="warning">Summa kassa qoldig‘idan ko‘p — server bunday o‘tkazmani qabul qilmaydi.</Alert>
        )}
      </form>
    </Modal>
  );
}
