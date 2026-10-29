import { MoneyController } from '@/components/form/MoneyController';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useCreateSource } from '@/hooks/useInlineCreate';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { applyFieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/lib/cn';
import { expensesService, financeService, incomesService } from '@/services/finance.service';
import { lookupsService } from '@/services/lookups.service';
import { formatMoney } from '@/utils/format';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from '@/utils/paymentLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { useFinanceCategories } from './useFinanceCategories';

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

  const { query: categoriesQuery, create: createCategory } = useFinanceCategories(kind);
  const createSource = useCreateSource();
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
    setValue,
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
  const categoryOptions = categories.map((category) => ({ value: category.id, label: category.name }));
  /** Eng ko'p ishlatilgan kategoriyalar — bir bosishda tanlash (ro'yxat uzun bo'lganda) */
  const frequent =
    categories.length > 5
      ? [...categories]
          .filter((category) => category.usage > 0)
          .sort((a, b) => b.usage - a.usage)
          .slice(0, 4)
      : [];

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
          <div className="sm:col-span-2">
            <FormField
              label="Kategoriya"
              htmlFor="money-category"
              error={errors.categoryId?.message}
              hint={errors.categoryId ? undefined : 'Ro‘yxatda yo‘q bo‘lsa — nomini yozib, Enter bosing'}
              required
            >
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Combobox
                    id="money-category"
                    options={categoryOptions}
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? '')}
                    placeholder={categoriesQuery.isPending ? 'Yuklanmoqda…' : 'Tanlang yoki yozing'}
                    emptyText="Kategoriya yo‘q"
                    loading={categoriesQuery.isPending}
                    invalid={Boolean(errors.categoryId)}
                    aria-describedby={errors.categoryId ? fieldErrorId('money-category') : undefined}
                    onCreate={createCategory}
                    createLabel={(text) => `“${text}” kategoriyasini qo‘shish`}
                    createHint="Yangi kategoriya qo‘shish uchun nomini yozing"
                  />
                )}
              />
              {frequent.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Ko‘p ishlatiladigan kategoriyalar">
                  {frequent.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={selectedCategoryId === category.id}
                      onClick={() => setValue('categoryId', category.id, { shouldValidate: true, shouldDirty: true })}
                      className={cn(
                        'focus-ring rounded-pill px-2.5 py-1 text-caption ring-1 transition-colors ring-inset',
                        selectedCategoryId === category.id
                          ? 'bg-primary-subtle font-medium text-primary ring-primary/40'
                          : 'text-fg-muted ring-border hover:bg-surface-muted hover:text-fg',
                      )}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              )}
            </FormField>
          </div>
          <FormField label="Summa (so‘m)" htmlFor="money-amount" error={errors.amount?.message} required>
            <MoneyController control={control} name="amount" id="money-amount" autoFocus invalid={Boolean(errors.amount)} />
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
          <FormField label="Reklama manbasi" htmlFor="money-source" hint="Ixtiyoriy — shu kanalning ROI hisobiga kiradi. Yangi kanal: nomini yozib, Enter">
            <Controller
              control={control}
              name="sourceId"
              render={({ field }) => (
                <Combobox
                  id="money-source"
                  options={(sourcesQuery.data?.sources ?? []).map((source) => ({ value: source.id, label: source.name }))}
                  value={field.value || null}
                  onChange={(value) => field.onChange(value ?? '')}
                  placeholder={sourcesQuery.isPending ? 'Yuklanmoqda…' : 'Tanlanmagan'}
                  loading={sourcesQuery.isPending}
                  emptyText="Manba yo‘q"
                  onCreate={createSource}
                  createLabel={(text) => `“${text}” manbasini qo‘shish`}
                  createHint="Yangi kanal qo‘shish uchun nomini yozing"
                />
              )}
            />
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
