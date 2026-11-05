import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { ReportingPeriodPicker } from '@/components/ReportingPeriodPicker';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { periodKey, shiftPeriod, useReportingPeriod } from '@/hooks/useReportingPeriod';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { billingService } from '@/services/billing.service';
import type { BillingReportMonth, BillingReportParams } from '@/types/billing';
import { formatMoney } from '@/utils/format';

const WINDOWS = [3, 6, 12] as const;

function Change({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous === undefined || previous === 0) return null;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return null;
  const up = percent > 0;
  return (
    <span className={`inline-flex items-center text-caption ${up ? 'text-success' : 'text-danger'}`}>
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      {Math.abs(percent)}%
    </span>
  );
}

/**
 * Oylik hisob: uch ko'rsatkich qat'iy alohida — hisoblangan majburiyat (qaysi oy uchun), kassa tushumi (qaysi sanada
 * kelgan) va qarz (oy oxiridagi holat). Bir to'lov ikki marta hisoblanmaydi: kassada — kelgan oyida, yig'ilganda —
 * qaysi oy uchun bo'lsa o'sha oyda.
 */
export function BillingReportTab() {
  const { period } = useReportingPeriod();
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(6);
  const params: BillingReportParams = { from: periodKey(shiftPeriod(period, -(window - 1))), to: periodKey(period) };
  const query = useQuery({ queryKey: queryKeys.debts.report(params), queryFn: () => billingService.report(params) });
  const months = query.data?.months ?? [];
  const selected: BillingReportMonth | undefined = months[months.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ReportingPeriodPicker />
        <Select value={String(window)} onChange={(event) => setWindow(Number(event.target.value) as (typeof WINDOWS)[number])} aria-label="Taqqoslash oralig‘i" wrapperClassName="w-40">
          {WINDOWS.map((value) => (
            <option key={value} value={value}>
              Oxirgi {value} oy
            </option>
          ))}
        </Select>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <Alert tone="error">{getErrorMessage(query.error)}</Alert>
      ) : (
        <>
          {selected && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard size="sm" title="Hisoblangan" value={formatMoney(selected.accrued)} description={`${selected.label} majburiyati · ${selected.students} ta o‘quvchi`} />
              <StatCard
                size="sm"
                title="Shu oy uchun yig‘ilgan"
                value={formatMoney(selected.collectedForPeriod)}
                description={`Qoldiq ${formatMoney(selected.remainingNow)}`}
              />
              <StatCard
                size="sm"
                title="Kassa tushumi"
                value={formatMoney(selected.cashNet)}
                description={`Oldingi oylar uchun ${formatMoney(selected.cashFor.earlier)} · oldindan ${formatMoney(selected.cashFor.later)}`}
              />
              <StatCard
                size="sm"
                title="Oy oxirida qarz"
                value={formatMoney(selected.debtAtPeriodEnd)}
                valueTone={selected.debtAtPeriodEnd > 0 ? 'danger' : 'default'}
                description={`${selected.debtors} ta qarzdor`}
              />
            </div>
          )}

          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[56rem] text-body">
              <caption className="sr-only">Oylar bo‘yicha taqqoslash</caption>
              <thead className="bg-surface-muted text-caption text-fg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Oy</th>
                  <th className="px-3 py-2 text-right font-medium">Hisoblangan</th>
                  <th className="px-3 py-2 text-right font-medium">Shu oy uchun yig‘ilgan</th>
                  <th className="px-3 py-2 text-right font-medium">Qoldiq (hozir)</th>
                  <th className="px-3 py-2 text-right font-medium">Kassa tushumi</th>
                  <th className="px-3 py-2 text-right font-medium">— oldingi oylar uchun</th>
                  <th className="px-3 py-2 text-right font-medium">— shu oy uchun</th>
                  <th className="px-3 py-2 text-right font-medium">— oldindan</th>
                  <th className="px-3 py-2 text-right font-medium">Oy oxirida qarz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {months.map((month, index) => {
                  const previous = months[index - 1];
                  return (
                    <tr key={month.period}>
                      <td className="px-3 py-2 text-left text-fg">{month.label}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(month.accrued)} <Change current={month.accrued} previous={previous?.accrued} />
                        {month.cancelled > 0 && <p className="text-caption text-fg-muted">bekor {formatMoney(month.cancelled)}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">{formatMoney(month.collectedForPeriod)}</td>
                      <td className={`px-3 py-2 text-right ${month.remainingNow > 0 ? 'text-danger' : ''}`}>{formatMoney(month.remainingNow)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatMoney(month.cashNet)} <Change current={month.cashNet} previous={previous?.cashNet} />
                        {month.refunds > 0 && <p className="text-caption text-fg-muted">qaytarilgan {formatMoney(month.refunds)}</p>}
                      </td>
                      <td className="px-3 py-2 text-right text-fg-muted">{formatMoney(month.cashFor.earlier)}</td>
                      <td className="px-3 py-2 text-right text-fg-muted">{formatMoney(month.cashFor.same)}</td>
                      <td className="px-3 py-2 text-right text-fg-muted">{formatMoney(month.cashFor.later)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatMoney(month.debtAtPeriodEnd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <p className="text-caption text-fg-muted">
            Kassa tushumi — pul kelib tushgan oyda; "shu oy uchun yig‘ilgan" — to‘lov qaysi oy majburiyatiga biriktirilgan bo‘lsa o‘sha oyda. O‘tgan oy
            oxiridagi qarz keyingi to‘lovlardan o‘zgarmaydi. Eski (biriktirilmagan) to‘lovlar oylarga muddat tartibida tushgan.
          </p>
        </>
      )}
    </div>
  );
}
