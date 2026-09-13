import { Lock, Percent } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer } from '@/components/ui/Table';
import { cn } from '@/lib/cn';
import type { CommissionEntry, CommissionMonth } from '@/types/commission';
import { COMMISSION_KIND_LABELS, COMMISSION_KIND_TONES } from '@/utils/commissionLabels';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { MONTH_OPTIONS, SALARY_STATUS_LABELS, SALARY_STATUS_TONES } from '@/utils/teacherLabels';

const now = new Date();
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => now.getFullYear() - index);

export function MonthSelect({
  year,
  month,
  onChange,
}: {
  year: number;
  month: number;
  onChange: (value: { year: number; month: number }) => void;
}) {
  return (
    <div className="flex gap-2">
      <Select value={month} onChange={(event) => onChange({ year, month: Number(event.target.value) })} aria-label="Oy" wrapperClassName="w-36">
        {MONTH_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select value={year} onChange={(event) => onChange({ year: Number(event.target.value), month })} aria-label="Yil" wrapperClassName="w-28">
        {YEAR_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = 'default',
  compact = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'positive' | 'negative';
  compact?: boolean;
}) {
  return (
    <Card className={compact ? 'p-3' : 'p-4'}>
      <p className="text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'mt-1 font-semibold whitespace-nowrap tabular-nums',
          compact ? 'text-base' : 'text-xl',
          tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'negative' && 'text-red-600 dark:text-red-400',
          tone === 'default' && 'text-fg',
        )}
      >
        {value}
      </p>
      {hint && !compact && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </Card>
  );
}

/** "Mening o‘quvchilarim … qolgan" — 8 ta asosiy ko‘rsatkich */
export function CommissionKpis({ month, compact = false }: { month: CommissionMonth; compact?: boolean }) {
  const salary = month.salary;
  return (
    <div className={cn('grid grid-cols-2 gap-3', compact ? 'sm:grid-cols-4' : 'lg:grid-cols-4')}>
      <Kpi compact={compact} label="O‘quvchilar" value={formatNumber(month.students)} hint="Guruhlardagi faol o‘quvchilar" />
      <Kpi compact={compact} label="To‘lovlar" value={formatNumber(month.payments)} hint={month.label} />
      <Kpi compact={compact} label="Tushum" value={formatMoney(month.revenue)} hint="Real tushgan, bekor qilinmagan" />
      <Kpi compact={compact} label="Foiz" value={month.percentage > 0 ? `${formatNumber(month.percentage)}%` : '—'} hint={month.percentage > 0 ? 'Tushumdan ulush' : 'Foizli model emas'} />
      <Kpi compact={compact}
        label="Hisoblangan foiz"
        value={formatMoney(month.commission)}
        tone={month.commission < 0 ? 'negative' : month.commission > 0 ? 'positive' : 'default'}
        hint={month.commission < 0 ? 'Qaytarilgan to‘lovlar hisobidan' : 'Teskari yozuvlar bilan'}
      />
      <Kpi compact={compact} label="Maosh jami" value={salary ? formatMoney(salary.totalAmount) : '—'} hint={salary ? 'Foiz, bonus va jarima bilan' : 'Hali hisoblanmagan'} />
      <Kpi compact={compact} label="To‘langan" value={salary ? formatMoney(salary.paidAmount) : '—'} />
      <Kpi compact={compact}
        label="Qolgan"
        value={salary ? formatMoney(salary.remainingAmount) : '—'}
        tone={salary && salary.remainingAmount > 0 ? 'negative' : 'default'}
        hint={salary ? SALARY_STATUS_LABELS[salary.status] : undefined}
      />
    </div>
  );
}

export function CommissionEntriesTable({ entries }: { entries: CommissionEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState icon={Percent} title="Bu oyda foiz yozuvi yo‘q" description="O‘quvchilar to‘lov qilganda foiz avtomatik yoziladi" />
    );
  }
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <TH>Sana</TH>
            <TH>Turi</TH>
            <TH>To‘lov</TH>
            <TH className="text-right">Summa</TH>
            <TH className="text-right">Foiz</TH>
            <TH className="text-right">Foiz summasi</TH>
          </tr>
        </THead>
        <TBody>
          {entries.map((entry) => (
            <TR key={entry.id}>
              <TD className="whitespace-nowrap text-fg-muted">{formatDate(entry.payment?.paidAt ?? entry.occurredAt)}</TD>
              <TD>
                <span className="inline-flex items-center gap-1.5">
                  <Badge tone={COMMISSION_KIND_TONES[entry.kind]}>{COMMISSION_KIND_LABELS[entry.kind]}</Badge>
                  {entry.locked && <Lock className="size-3.5 text-fg-subtle" aria-label="Maosh tasdiqlangan" />}
                </span>
              </TD>
              <TD>
                {entry.payment ? (
                  <>
                    <p className="font-medium text-fg">
                      {entry.payment.student.firstName} {entry.payment.student.lastName}
                    </p>
                    <p className="text-xs text-fg-muted">
                      <span className="font-mono">{entry.payment.code}</span>
                      {entry.payment.group && ` · ${entry.payment.group.name}`}
                      {entry.kind === 'REVERSAL' && entry.reason && ` · ${entry.reason}`}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-fg-muted">{entry.reason ?? '—'}</p>
                )}
              </TD>
              <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{entry.baseAmount === 0 ? '—' : formatMoney(entry.baseAmount)}</TD>
              <TD className="text-right tabular-nums text-fg-muted">{entry.percentage > 0 ? `${formatNumber(entry.percentage)}%` : '—'}</TD>
              <TD
                className={cn(
                  'text-right font-medium whitespace-nowrap tabular-nums',
                  entry.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg',
                )}
              >
                {entry.amount > 0 ? '+' : ''}
                {formatMoney(entry.amount)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}

export function CommissionHistoryTable({
  history,
  selected,
  onSelect,
}: {
  history: CommissionMonth[];
  selected: { year: number; month: number };
  onSelect: (value: { year: number; month: number }) => void;
}) {
  return (
    <TableContainer>
      <Table>
        <THead>
          <tr>
            <TH>Oy</TH>
            <TH className="text-right">Tushum</TH>
            <TH className="text-right">Foiz summasi</TH>
            <TH className="text-right">Maosh</TH>
            <TH className="text-right">To‘langan</TH>
            <TH className="text-right">Qolgan</TH>
            <TH>Holat</TH>
          </tr>
        </THead>
        <TBody>
          {history.map((row) => {
            const active = row.year === selected.year && row.month === selected.month;
            return (
              <TR
                key={`${row.year}-${row.month}`}
                onClick={() => onSelect({ year: row.year, month: row.month })}
                className={cn('cursor-pointer', active && 'bg-brand-50/60 dark:bg-brand-950/40')}
              >
                <TD className="font-medium whitespace-nowrap text-fg">{row.label}</TD>
                <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{formatMoney(row.revenue)}</TD>
                <TD className={cn('text-right whitespace-nowrap tabular-nums', row.commission < 0 ? 'text-red-600 dark:text-red-400' : 'text-fg')}>
                  {formatMoney(row.commission)}
                </TD>
                <TD className="text-right whitespace-nowrap tabular-nums text-fg">{row.salary ? formatMoney(row.salary.totalAmount) : '—'}</TD>
                <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{row.salary ? formatMoney(row.salary.paidAmount) : '—'}</TD>
                <TD className="text-right whitespace-nowrap tabular-nums text-fg-muted">{row.salary ? formatMoney(row.salary.remainingAmount) : '—'}</TD>
                <TD>
                  {row.salary ? (
                    <Badge tone={SALARY_STATUS_TONES[row.salary.status]}>{SALARY_STATUS_LABELS[row.salary.status]}</Badge>
                  ) : (
                    <span className="text-xs text-fg-subtle">Hisoblanmagan</span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableContainer>
  );
}
