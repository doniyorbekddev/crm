import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { expensesService, financeService, incomesService } from '@/services/finance.service';
import { lookupsService } from '@/services/lookups.service';
import { formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const schema = z.object({
  categoryId: z.string().min(1, 'Kategoriyani tanlang'),
  amount: z.string().refine((value) => /^\d{4,9}$/.test(value) && Number(value) >= 1000, 'Eng kam summa — 1 000 so‘m'),
  method: z.enum(PAYMENT_METHOD_ORDER),
  accountId: z.string(),
  date: z.string(),
  description: z.string().trim().max(255, 'Izoh juda uzun'),
  vendor: z.string().trim().max(150, 'Yetkazib beruvchi nomi juda uzun'),
  sourceId: z.string(),
});

type FormValues = z.infer<typeof schema>;

interface MoneyFormModalProps {
  kind: 'income' | 'expense';
  onClose: () => void;
  onSaved: () => void;
}

export function MoneyFormModal({ kind, onClose, onSaved }: MoneyFormModalProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const service = kind === 'income' ? incomesService : expensesService;

  const categoriesQuery = useQuery({
    queryKey: kind === 'income' ? queryKeys.incomes.categories : queryKeys.expenses.categories,
    queryFn: service.categories,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts({}),
    queryFn: () => financeService.accounts(),
    staleTime: 60_000,
  });
  const isExpense = kind === 'expense';
  const canApprove = usePermission(PERMISSIONS.EXPENSE_APPROVE);
  const settingsQuery = useQuery({
    queryKey: queryKeys.expenses.approvalSettings,
    queryFn: expensesService.approvalSettings,
    enabled: isExpense,
    staleTime: 60_000,
  });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      categoryId: '',
      amount: '',
      method: 'CASH' as const,
      accountId: '',
      date: new Date().toISOString().slice(0, 10),
      description: '',
      vendor: '',
      sourceId: '',
    },
  });
  // Reklama xarajati kanalga bog'lanadi — manba bo'yicha ROI shu yerdan chiqadi
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const isMarketing = isExpense && (categoriesQuery.data ?? []).some((item) => item.id === selectedCategoryId && item.key === 'ADVERTISEMENT');
  const sourcesQuery = useQuery({
    queryKey: queryKeys.lookups.marketingSources,
    queryFn: lookupsService.marketingSources,
    enabled: isMarketing,
    staleTime: 5 * 60_000,
  });
  const amount = Number(useWatch({ control, name: 'amount' }) || 0);
  const threshold = settingsQuery.data?.approvalThreshold ?? 0;
  const needsApproval = isExpense && !canApprove && threshold > 0 && amount >= threshold;

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      service.create({
        categoryId: values.categoryId,
        amount: Number(values.amount),
        method: values.method,
        ...(values.accountId ? { accountId: values.accountId } : {}),
        ...(values.date ? { date: values.date } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(isExpense && values.vendor ? { vendor: values.vendor } : {}),
        ...(isMarketing && values.sourceId ? { sourceId: values.sourceId } : {}),
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['categoryId', 'amount', 'method', 'accountId'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  const categories = (categoriesQuery.data ?? []).filter((category) => category.isActive);

  return (
    <Modal
      open
      title={kind === 'income' ? 'Tushum qo‘shish' : 'Xarajat qo‘shish'}
      description={
        kind === 'income'
          ? 'Tushum moliyaviy daftarga tushadi va kassa qoldig‘ini oshiradi'
          : 'Xarajat moliyaviy daftarga tushadi va kassa qoldig‘ini kamaytiradi'
      }
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="money-form" loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <form id="money-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Kategoriya" htmlFor="money-category" error={errors.categoryId?.message} required>
            <Select
              id="money-category"
              invalid={Boolean(errors.categoryId)}
              aria-describedby={errors.categoryId ? fieldErrorId('money-category') : undefined}
              disabled={categoriesQuery.isPending}
              {...register('categoryId')}
            >
              <option value="">Tanlang…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Summa (so‘m)" htmlFor="money-amount" error={errors.amount?.message} required>
            <Input id="money-amount" autoFocus inputMode="numeric" invalid={Boolean(errors.amount)} {...register('amount')} />
          </FormField>
          <FormField label="To‘lov usuli" htmlFor="money-method" error={errors.method?.message} required>
            <Select id="money-method" {...register('method')}>
              {PAYMENT_METHOD_ORDER.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Kassa"
            htmlFor="money-account"
            error={errors.accountId?.message}
            hint="Bo‘sh qoldirilsa — to‘lov usuliga mos kassa"
          >
            <Select id="money-account" {...register('accountId')}>
              <option value="">Avtomatik</option>
              {(accountsQuery.data?.items ?? [])
                .filter((account) => account.isActive)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {formatMoney(account.balance)}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Sana" htmlFor="money-date" error={errors.date?.message}>
            <Input id="money-date" type="date" {...register('date')} />
          </FormField>
        </div>

        {isExpense && (
          <FormField label="Yetkazib beruvchi" htmlFor="money-vendor" error={errors.vendor?.message} hint="Ixtiyoriy — kompaniya yoki shaxs">
            <Input id="money-vendor" placeholder="Oqtepa Plaza MChJ" {...register('vendor')} />
          </FormField>
        )}

        {isMarketing && (
          <FormField label="Reklama manbasi" htmlFor="money-source" hint="Ixtiyoriy — tanlansa, shu kanalning ROI hisobiga kiradi">
            <Select id="money-source" disabled={sourcesQuery.isPending} {...register('sourceId')}>
              <option value="">Tanlanmagan</option>
              {(sourcesQuery.data?.sources ?? []).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        {needsApproval && (
          <Alert tone="warning">
            Summa tasdiq chegarasidan ({formatMoney(threshold)}) katta — rahbar tasdiqlab, to‘lov qilinmaguncha kassadan yechilmaydi.
          </Alert>
        )}

        <FormField label="Izoh" htmlFor="money-description" error={errors.description?.message} hint="Ixtiyoriy">
          <Textarea id="money-description" rows={2} {...register('description')} />
        </FormField>
      </form>
    </Modal>
  );
}
