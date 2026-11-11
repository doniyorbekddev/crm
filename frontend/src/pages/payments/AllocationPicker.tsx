import { useQuery } from '@tanstack/react-query';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentScheduleService } from '@/services/paymentSchedule.service';
import type { PaymentSchedule } from '@/types/paymentSchedule';
import { allocateToSelected, businessToday, dueCountdown, periodKeyLabel, previewAutoAllocation } from '@/utils/billingLabels';
import type { DueCountdown } from '@/utils/billingLabels';
import { formatMoney } from '@/utils/format';

/**
 * - `auto`   — oy belgilanmagan: server eng eski ochiq oydan biriktiradi;
 * - `months` — operator oylarni belgilaydi: summa shu oylarga (eskisidan) to'liq qoldig'igacha tushadi;
 * - `manual` — har oyga summani qo'lda yozish (masalan, oktyabrga 300 000, noyabrga 200 000).
 */
export type AllocationMode = 'auto' | 'months' | 'manual';

export interface AllocationValue {
  mode: AllocationMode;
  /** Belgilangan oylar va ularning qoldig'i (`months` rejimi) */
  selected: Array<{ key: string; remaining: number }>;
  /** Qo'lda: oy kaliti → summa */
  manual: Record<string, number | null>;
}

export const AUTO_ALLOCATION: AllocationValue = { mode: 'auto', selected: [], manual: {} };

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

/** API `allocations`: avtomatik rejimda yuborilmaydi (server o'zi eng eski oydan biriktiradi) */
export function allocationPayload(value: AllocationValue, amount: number): Array<{ period: string; amount: number }> | undefined {
  if (value.mode === 'manual') return manualAllocations(value);
  if (value.mode === 'months' && value.selected.length > 0) {
    return allocateToSelected(value.selected, amount).items.map((item) => ({ period: item.key, amount: item.amount }));
  }
  return undefined;
}

/** Saqlashdan oldingi tekshiruv: xato matni yoki null */
export function allocationIssue(value: AllocationValue, amount: number): string | null {
  if (value.mode === 'manual' && manualTotal(value) !== amount) return 'Oylarga taqsimlangan summa to‘lov summasiga teng bo‘lishi kerak';
  if (value.mode === 'months' && value.selected.length > 0) {
    const { excess } = allocateToSelected(value.selected, amount);
    if (excess > 0) return `Summa belgilangan oylar qoldig‘idan ${formatMoney(excess)} ortiq — yana oy belgilang yoki summani kamaytiring`;
  }
  return null;
}

export interface OpenMonth {
  key: string;
  remaining: number;
  /** Shu oydagi eng eski to'lanmagan qism muddati */
  dueDate: string;
  countdown: DueCountdown;
}

/** To'lanmagan (bekor qilinmagan) oylar, muddati bilan — eskisidan */
export function openMonthsOf(schedule: PaymentSchedule, today: string = businessToday()): OpenMonth[] {
  const dueByMonth = new Map<string, string>();
  for (const item of schedule.installments) {
    if (item.remaining <= 0 || item.status === 'CANCELLED') continue;
    const key = item.dueDate.slice(0, 7);
    const current = dueByMonth.get(key);
    if (!current || item.dueDate < current) dueByMonth.set(key, item.dueDate);
  }
  return schedule.months
    .filter((month) => month.remaining > 0 && month.status !== 'CANCELLED')
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((month) => {
      const dueDate = dueByMonth.get(month.key) ?? `${month.key}-01`;
      return { key: month.key, remaining: month.remaining, dueDate, countdown: dueCountdown(dueDate, today) };
    });
}

const COUNTDOWN_TONES = { overdue: 'red', today: 'yellow', upcoming: 'blue' } as const;

function DueBadge({ countdown }: { countdown: DueCountdown }) {
  return <Badge tone={COUNTDOWN_TONES[countdown.kind]}>{countdown.kind === 'overdue' ? `qarz · ${countdown.text}` : countdown.text}</Badge>;
}

interface AllocationPickerProps {
  studentId: string;
  amount: number;
  value: AllocationValue;
  onChange: (value: AllocationValue) => void;
  /** Oy belgilanganda to'lov summasini belgilangan oylar qoldig'iga tenglash */
  onSuggestAmount?: (amount: number) => void;
  error?: string | null;
  disabled?: boolean;
}

/**
 * To'lov qaysi oy(lar) uchun. Muddati kelgan oylar ("qarz · 6 kun kechikdi") va navbatdagi oy ("4 kun qoldi") ko'rinadi,
 * keyingilari — "oldindan to'lov" ostida. Oy belgilansa summa o'sha oylar qoldig'iga tenglanadi; belgilanmasa —
 * eng eski qarzdan. To'lov sanasi (kassa) alohida maydon — bu faqat oy majburiyati.
 */
export function AllocationPicker({ studentId, amount, value, onChange, onSuggestAmount, error, disabled }: AllocationPickerProps) {
  const [showLater, setShowLater] = useState(false);
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

  const open = openMonthsOf(scheduleQuery.data);
  const due = open.filter((month) => month.countdown.kind !== 'upcoming');
  const next = open.find((month) => month.countdown.kind === 'upcoming');
  const primary = next ? [...due, next] : due;
  const later = open.filter((month) => !primary.includes(month));
  const selectedKeys = new Set(value.selected.map((item) => item.key));
  const visible = showLater || later.some((month) => selectedKeys.has(month.key)) ? open : primary;

  // Summa qaysi oylarga tushadi (ko'rinish uchun)
  const preview = new Map(
    (value.mode === 'months' && value.selected.length > 0 ? allocateToSelected(value.selected, amount).items : previewAutoAllocation(open, amount)).map((item) => [item.key, item.amount]),
  );
  const dueTotal = due.reduce((sum, month) => sum + month.remaining, 0);

  function toggle(month: OpenMonth, checked: boolean) {
    const selected = checked ? [...value.selected, { key: month.key, remaining: month.remaining }] : value.selected.filter((item) => item.key !== month.key);
    selected.sort((a, b) => a.key.localeCompare(b.key));
    onChange(selected.length > 0 ? { mode: 'months', selected, manual: {} } : AUTO_ALLOCATION);
    if (selected.length > 0) onSuggestAmount?.(selected.reduce((sum, item) => sum + item.remaining, 0));
  }

  return (
    <fieldset className="space-y-3 rounded-card border border-border p-3" disabled={disabled}>
      <legend className="flex items-center gap-1.5 px-1 text-label text-fg">
        <CalendarRange className="size-4 text-fg-muted" aria-hidden />
        Qaysi oy uchun
      </legend>
      {open.length === 0 ? (
        <p className="text-caption text-fg-muted">Ochiq oy majburiyati yo‘q — to‘lov umumiy balansga yoziladi.</p>
      ) : value.mode === 'manual' ? (
        <div className="space-y-2">
          {open.map((month) => (
            <div key={month.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_auto_10rem]">
              <span className="flex flex-wrap items-center gap-1.5 text-body text-fg">
                {periodKeyLabel(month.key)}
                <DueBadge countdown={month.countdown} />
              </span>
              <span className="text-caption text-fg-muted sm:text-right">qoldiq {formatMoney(month.remaining)}</span>
              <CurrencyInput
                aria-label={`${periodKeyLabel(month.key)} uchun summa`}
                value={value.manual[month.key] ?? null}
                max={month.remaining}
                onValueChange={(nextValue) => onChange({ mode: 'manual', selected: [], manual: { ...value.manual, [month.key]: nextValue } })}
                className="col-span-2 sm:col-span-1"
              />
            </div>
          ))}
          <p className={cn('text-caption', manualTotal(value) === amount ? 'text-success' : 'text-danger')} role="status">
            Taqsimlangan {formatMoney(manualTotal(value))} / to‘lov {formatMoney(amount)}
            {manualTotal(value) !== amount && ` · ${amount > manualTotal(value) ? 'yana' : 'ortiqcha'} ${formatMoney(Math.abs(amount - manualTotal(value)))}`}
          </p>
          <Button size="sm" variant="ghost" onClick={() => onChange(AUTO_ALLOCATION)}>
            Oylarni belgilashga qaytish
          </Button>
        </div>
      ) : (
        <>
          <p className="text-caption text-fg-muted">
            {dueTotal > 0 ? `Muddati kelgan qarz: ${formatMoney(dueTotal)}. ` : 'Muddati kelgan qarz yo‘q. '}
            Oyni belgilang — summa o‘zi to‘ladi. Belgilanmasa, to‘lov eng eski qarzdan yopiladi.
          </p>
          <ul className="divide-y divide-border rounded-control border border-border" aria-label="Ochiq oylar">
            {visible.map((month) => {
              const share = preview.get(month.key) ?? 0;
              const closes = share > 0 && share >= month.remaining;
              return (
                <li key={month.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2 text-body text-fg">
                    <Checkbox checked={selectedKeys.has(month.key)} onChange={(event) => toggle(month, event.target.checked)} aria-label={`${periodKeyLabel(month.key)} uchun to‘lash`} />
                    <span>{periodKeyLabel(month.key)}</span>
                    <DueBadge countdown={month.countdown} />
                  </label>
                  <span className="flex items-center gap-2 text-body">
                    <span className="font-medium text-fg">{formatMoney(month.remaining)}</span>
                    {share > 0 && <Badge tone={closes ? 'green' : 'yellow'}>{closes ? 'yopiladi' : `${formatMoney(share)} tushadi`}</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {later.length > 0 && !visible.includes(later[0]!) ? (
              <Button size="sm" variant="ghost" leftIcon={<ChevronDown className="size-4" aria-hidden />} onClick={() => setShowLater(true)}>
                {`Keyingi oylar (${later.length}) — oldindan to‘lov`}
              </Button>
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ mode: 'manual', selected: [], manual: Object.fromEntries([...preview].map(([key, share]) => [key, share])) })}
            >
              Summani oylarga o‘zim bo‘laman
            </Button>
          </div>
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
