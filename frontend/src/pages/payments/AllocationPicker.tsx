import { useQuery } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentScheduleService } from '@/services/paymentSchedule.service';
import { periodKeyLabel, previewAutoAllocation } from '@/utils/billingLabels';
import { formatMoney } from '@/utils/format';

export type AllocationMode = 'auto' | 'manual';

export interface AllocationValue {
  mode: AllocationMode;
  /** Qo'lda: oy kaliti → summa */
  manual: Record<string, number | null>;
}

export const AUTO_ALLOCATION: AllocationValue = { mode: 'auto', manual: {} };

export function manualTotal(value: AllocationValue): number {
  return Object.values(value.manual).reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
}

/** Qo'lda taqsimot → API `allocations` (nol qatorlar tashlanadi) */
export function manualAllocations(value: AllocationValue): Array<{ period: string; amount: number }> {
  return Object.entries(value.manual)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, amount]) => ({ period, amount: amount ?? 0 }));
}

interface AllocationPickerProps {
  studentId: string;
  amount: number;
  value: AllocationValue;
  onChange: (value: AllocationValue) => void;
  error?: string | null;
  disabled?: boolean;
}

/**
 * To'lov qaysi oy(lar) qarzi uchun: standart — eng eski ochiq oydan (server ham shunday biriktiradi); qo'lda —
 * operator oylarni tanlab summani bo'ladi. To'lov sanasi (kassa) alohida maydon — bu faqat oy majburiyati.
 */
export function AllocationPicker({ studentId, amount, value, onChange, error, disabled }: AllocationPickerProps) {
  const scheduleQuery = useQuery({
    queryKey: queryKeys.students.paymentSchedule(studentId),
    queryFn: () => paymentScheduleService.get(studentId),
    retry: false,
  });

  if (scheduleQuery.isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  // Jadvalni ko'rish ruxsati bo'lmasa yoki jadval yo'q — server o'zi biriktiradi
  if (scheduleQuery.isError) return null;

  const open = scheduleQuery.data.months.filter((month) => month.remaining > 0 && month.status !== 'CANCELLED');
  const preview = previewAutoAllocation(
    open.map((month) => ({ key: month.key, remaining: month.remaining })),
    amount,
  );
  const allocated = manualTotal(value);
  const difference = amount - allocated;

  return (
    <fieldset className="space-y-3 rounded-card border border-border p-3" disabled={disabled}>
      <legend className="flex items-center gap-1.5 px-1 text-label text-fg">
        <CalendarRange className="size-4 text-fg-muted" aria-hidden />
        Qaysi oy uchun
      </legend>
      {open.length === 0 ? (
        <p className="text-caption text-fg-muted">Ochiq oy majburiyati yo‘q — to‘lov umumiy balansga yoziladi.</p>
      ) : (
        <>
          <Tabs
            value={value.mode}
            onValueChange={(mode) =>
              onChange(
                mode === 'manual'
                  ? { mode: 'manual', manual: Object.fromEntries(preview.map((item) => [item.key, item.amount])) }
                  : AUTO_ALLOCATION,
              )
            }
            variant="pill"
            panels={false}
          >
            <TabList label="Taqsimlash usuli">
              <Tab value="auto">Eng eski qarzdan</Tab>
              <Tab value="manual">Oylarni tanlash</Tab>
            </TabList>
          </Tabs>

          {value.mode === 'auto' ? (
            preview.length === 0 ? (
              <p className="text-caption text-fg-muted">Summani kiriting — qaysi oylar yopilishi shu yerda ko‘rinadi.</p>
            ) : (
              <ul className="space-y-1" aria-label="Avtomatik taqsimot">
                {preview.map((item) => {
                  const month = open.find((entry) => entry.key === item.key);
                  const closes = month !== undefined && item.amount >= month.remaining;
                  return (
                    <li key={item.key} className="flex items-center justify-between gap-2 text-body">
                      <span className="text-fg">{periodKeyLabel(item.key)}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-fg">{formatMoney(item.amount)}</span>
                        <Badge tone={closes ? 'green' : 'yellow'}>{closes ? 'yopiladi' : `qoldiq ${formatMoney((month?.remaining ?? 0) - item.amount)}`}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <div className="space-y-2">
              {open.map((month) => (
                <div key={month.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto_10rem]">
                  <span className="text-body text-fg">{periodKeyLabel(month.key)}</span>
                  <span className="text-caption text-fg-muted sm:text-right">qoldiq {formatMoney(month.remaining)}</span>
                  <CurrencyInput
                    aria-label={`${periodKeyLabel(month.key)} uchun summa`}
                    value={value.manual[month.key] ?? null}
                    max={month.remaining}
                    onValueChange={(next) => onChange({ mode: 'manual', manual: { ...value.manual, [month.key]: next } })}
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
              ))}
              <p className={cn('text-caption', difference === 0 ? 'text-success' : 'text-danger')} role="status">
                Taqsimlangan {formatMoney(allocated)} / to‘lov {formatMoney(amount)}
                {difference !== 0 && ` · ${difference > 0 ? 'yana' : 'ortiqcha'} ${formatMoney(Math.abs(difference))}`}
              </p>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="text-caption text-danger" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
