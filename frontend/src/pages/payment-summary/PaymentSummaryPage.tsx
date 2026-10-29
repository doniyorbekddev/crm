import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarRange, GraduationCap, HandCoins, PieChart, Target, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExportMenu } from '@/components/ExportMenu';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { normalizeOptionText } from '@/components/ui/optionList';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { useExport } from '@/hooks/useExport';
import { usePermission } from '@/hooks/usePermission';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { paymentSummaryService } from '@/services/paymentSummary.service';
import type { PaymentSummaryRow, PaymentSummaryScope, PaymentSummaryTotals } from '@/types/paymentSummary';
import { formatDateTime, formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const SCOPES: Array<{ value: PaymentSummaryScope; label: string }> = [
  { value: 'ALL', label: 'Barcha o‘quvchilar' },
  { value: 'STUDYING', label: 'O‘qiyotganlar' },
  { value: 'FINISHED', label: 'Bitirganlar' },
  { value: 'DROPPED', label: 'Ketganlar' },
];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

type View = 'course' | 'category';

function percentOf(totals: PaymentSummaryTotals): string {
  return totals.collectedPercent === null ? '—' : `${String(totals.collectedPercent).replace('.', ',')}%`;
}

/** Toifa bo'yicha: kurs qatorlari yig'iladi (foiz qayta hisoblanadi) */
function byCategory(rows: PaymentSummaryRow[]): Array<PaymentSummaryTotals & { key: string; label: string }> {
  const groups = new Map<string, PaymentSummaryTotals & { key: string; label: string }>();
  for (const row of rows) {
    // Markaz o'zi yozgan yo'nalishlar ("Robototexnika", "Shaxmat") "Boshqa"ga qo'shilib ketmaydi — alohida guruh
    const groupKey = row.category === 'OTHER' ? `OTHER:${normalizeOptionText(row.categoryLabel)}` : row.category;
    const current = groups.get(groupKey) ?? {
      key: groupKey,
      label: row.categoryLabel,
      students: 0,
      activeStudents: 0,
      debtors: 0,
      withoutContract: 0,
      expected: 0,
      collected: 0,
      remaining: 0,
      overdue: 0,
      monthCollected: 0,
      collectedPercent: null,
    };
    for (const field of ['students', 'activeStudents', 'debtors', 'withoutContract', 'expected', 'collected', 'remaining', 'overdue', 'monthCollected'] as const) {
      current[field] += row[field];
    }
    current.collectedPercent = current.expected > 0 ? Math.round((current.collected / current.expected) * 1000) / 10 : null;
    groups.set(groupKey, current);
  }
  return [...groups.values()].sort((a, b) => b.expected - a.expected);
}

/** Yig'ilgan / qolgan — bitta chiziqda */
function CollectionBar({ totals, className }: { totals: PaymentSummaryTotals; className?: string }) {
  const percent = totals.expected > 0 ? Math.min((totals.collected / totals.expected) * 100, 100) : 0;
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-danger-subtle', className)}
      role="progressbar"
      aria-label="Yig‘ilish darajasi"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="h-full origin-left animate-grow-x rounded-full bg-success-solid" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * To'lov xulosasi: jami yig'ilishi kerak, yig'ilgan, qolgan, muddati o'tgan va yo'nalishlar (kurslar) bo'yicha
 * o'quvchilar soni, tushum va qarz — bitta sahifada. Manba — o'quvchilar shartnoma balansi (Qarzdorlik bilan bir xil).
 */
export default function PaymentSummaryPage() {
  const [scope, setScope] = useState<PaymentSummaryScope>('ALL');
  const [view, setView] = useState<View>('course');
  const canExport = usePermission(PERMISSIONS.REPORT_EXPORT);
  const { exporting, run: runExport } = useExport();
  const query = useQuery({ queryKey: queryKeys.paymentSummary(scope), queryFn: () => paymentSummaryService.get(scope), placeholderData: keepPreviousData });
  const data = query.data;

  const header = (
    <PageHeader
      title="To‘lov xulosasi"
      description="Jami qancha yig‘ilishi kerak, qancha yig‘ildi va qancha qoldi — yo‘nalishlar bo‘yicha"
      actions={
        <>
          <Select aria-label="O‘quvchilar" value={scope} onChange={(event) => setScope(event.target.value as PaymentSummaryScope)} wrapperClassName="sm:w-52">
            {SCOPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
          {canExport && <ExportMenu loading={exporting} disabled={!data} onExport={(format) => void runExport('/payment-summary/export', { scope }, `tolov-xulosasi-${scope.toLowerCase()}`, format)} />}
        </>
      }
    />
  );

  if (!data) {
    return (
      <>
        {header}
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-72 w-full" />
          </div>
        )}
      </>
    );
  }

  const { totals } = data;
  const monthLabel = `${MONTHS[data.month.month - 1]} ${data.month.year}`;
  const rows = view === 'course' ? data.courses.map((row) => ({ ...row, key: row.courseId, label: row.courseName, sub: row.categoryLabel })) : byCategory(data.courses).map((row) => ({ ...row, sub: null }));

  return (
    <>
      {header}

      <div className={cn('space-y-4', query.isFetching && 'opacity-70')}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Jami yig‘ilishi kerak" value={formatMoney(totals.expected)} description={`${formatNumber(totals.students - totals.withoutContract)} ta shartnoma bo‘yicha`} icon={Target} tone="primary" />
          <StatCard title="Yig‘ilgan" value={formatMoney(totals.collected)} description={`Yig‘ilish: ${percentOf(totals)}`} icon={Wallet} tone="success" valueTone="success" />
          <StatCard title="Qolgan (qarz)" value={formatMoney(totals.remaining)} description={`${formatNumber(totals.debtors)} ta qarzdor o‘quvchi`} icon={HandCoins} tone="danger" valueTone={totals.remaining > 0 ? 'danger' : 'default'} to="/debts" />
          <StatCard title="Muddati o‘tgan" value={formatMoney(totals.overdue)} description="To‘lov jadvali bo‘yicha o‘tib ketgan qism" icon={AlertTriangle} tone="warning" valueTone={totals.overdue > 0 ? 'warning' : 'default'} to="/debts" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard size="sm" title="O‘quvchilar" value={formatNumber(totals.students)} description={`Faol: ${formatNumber(totals.activeStudents)}`} icon={Users} />
          <StatCard size="sm" title={`Shu oy tushgan (${monthLabel})`} value={formatMoney(totals.monthCollected)} icon={CalendarRange} tone="info" />
          <StatCard size="sm" title="Yo‘nalishlar" value={formatNumber(data.courses.filter((row) => row.students > 0).length)} description="O‘quvchisi bor kurslar" icon={GraduationCap} />
        </div>

        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-body">
            <span className="font-medium text-fg">
              Yig‘ildi {formatMoney(totals.collected)} / {formatMoney(totals.expected)}
            </span>
            <span className="text-fg-muted">Qoldi {formatMoney(totals.remaining)}</span>
          </div>
          <CollectionBar totals={totals} className="h-3" />
        </Card>

        {totals.withoutContract > 0 && (
          <Alert tone="info">
            {formatNumber(totals.withoutContract)} ta o‘quvchida shartnoma summasi kiritilmagan — ular “yig‘ilishi kerak” summasiga kirmaydi.
          </Alert>
        )}

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-label font-semibold text-fg">
              <PieChart className="size-4" aria-hidden />
              Yo‘nalishlar bo‘yicha
            </h2>
            <div role="group" aria-label="Ko‘rinish" className="inline-flex rounded-control border border-border p-0.5">
              {(
                [
                  ['course', 'Kurs bo‘yicha'],
                  ['category', 'Toifa bo‘yicha'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn('focus-ring rounded-sm px-3 py-1 text-caption font-medium', view === value ? 'bg-primary-solid text-white' : 'text-fg-muted hover:text-fg')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={PieChart} title="Ma’lumot yo‘q" description="Bu tanlov bo‘yicha o‘quvchi topilmadi" />
          ) : (
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <TH>Yo‘nalish</TH>
                    <TH className="text-right">O‘quvchilar</TH>
                    <TH className="text-right">Yig‘ilishi kerak</TH>
                    <TH className="text-right">Yig‘ilgan</TH>
                    <TH className="text-right">Qolgan</TH>
                    <TH className="text-right">Muddati o‘tgan</TH>
                    <TH className="min-w-40">Yig‘ilish</TH>
                    <TH className="text-right">Shu oy</TH>
                  </tr>
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.key}>
                      <TD>
                        {view === 'course' ? (
                          <Link to={`/debts?courseId=${row.key}`} className="font-medium text-fg hover:text-primary hover:underline">
                            {row.label}
                          </Link>
                        ) : (
                          <span className="font-medium text-fg">{row.label}</span>
                        )}
                        {row.sub && <span className="block text-caption text-fg-subtle">{row.sub}</span>}
                      </TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">
                        {formatNumber(row.students)}
                        <span className="block text-caption text-fg-subtle">faol {formatNumber(row.activeStudents)}</span>
                      </TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatMoney(row.expected)}</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums text-success">{formatMoney(row.collected)}</TD>
                      <TD className={cn('whitespace-nowrap text-right tabular-nums', row.remaining > 0 ? 'text-danger' : 'text-fg-muted')}>
                        {formatMoney(row.remaining)}
                        {row.debtors > 0 && <span className="block text-caption text-fg-subtle">{formatNumber(row.debtors)} ta qarzdor</span>}
                      </TD>
                      <TD className={cn('whitespace-nowrap text-right tabular-nums', row.overdue > 0 ? 'text-warning' : 'text-fg-muted')}>{formatMoney(row.overdue)}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <CollectionBar totals={row} className="flex-1" />
                          <span className="w-12 text-right text-caption tabular-nums text-fg-muted">{percentOf(row)}</span>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap text-right tabular-nums">{formatMoney(row.monthCollected)}</TD>
                    </TR>
                  ))}
                </TBody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <TD>Jami</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatNumber(totals.students)}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatMoney(totals.expected)}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums text-success">{formatMoney(totals.collected)}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums text-danger">{formatMoney(totals.remaining)}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatMoney(totals.overdue)}</TD>
                    <TD className="text-right text-caption tabular-nums">{percentOf(totals)}</TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatMoney(totals.monthCollected)}</TD>
                  </tr>
                </tfoot>
              </Table>
            </TableContainer>
          )}
        </Card>

        <p className="text-caption text-fg-subtle">
          {data.scopeLabel} · {formatDateTime(data.generatedAt)} holatiga. “Yig‘ilishi kerak” — shartnoma summalari (chegirmalardan keyin); “Yig‘ilgan” — bekor qilish va
          qaytarishlardan keyin. Yo‘nalish — o‘quvchining asosiy kursi.
        </p>
      </div>
    </>
  );
}
