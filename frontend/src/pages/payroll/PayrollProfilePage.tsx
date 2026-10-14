import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, Calculator, CalendarDays, ChevronLeft, ChevronRight, HandCoins, History, Layers, MoreHorizontal, Send, Undo2, Wallet2 } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ProfileHeader, ProfileStat } from '@/components/ProfileHeader';
import type { ProfileMetaItem } from '@/components/ProfileHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Timeline } from '@/components/ui/Timeline';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { salaryService } from '@/services/salary.service';
import type { PayeeKind, PayrollProfile, SalesActivity } from '@/types/payroll';
import type { SalaryPeriod } from '@/types/teacher';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/utils/format';
import { MONTH_OPTIONS, SALARY_STATUS_LABELS, SALARY_STATUS_TONES, SALARY_TYPE_LABELS } from '@/utils/teacherLabels';
import { CalculationBreakdown } from './CalculationBreakdown';
import { KpiPoolModal } from './KpiPoolModal';
import { KpiResultsCard } from './KpiResultsCard';
import { PAYMENT_STATE_LABELS, PAYMENT_STATE_TONES, formatKpiValue, paymentStateOf } from './payrollUtils';
import { usePayrollActions } from './usePayrollActions';

const BACK = { to: '/salaries', label: 'Maoshlar' };

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Xodim yoki o'qituvchining maosh profili: kelishuv (model, stavka, KPI), tanlangan oy hisobi va uning izohi,
 * tasdiqlash holati, tarix va o'zgarishlar xronologiyasi. Amallar ro'yxat sahifasidagi bilan bir xil.
 */
export default function PayrollProfilePage() {
  const { type: typeParam = '', id = '' } = useParams();
  const type: PayeeKind = typeParam === 'teacher' ? 'TEACHER' : 'EMPLOYEE';
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date();
  const year = Number(searchParams.get('year')) || today.getFullYear();
  const month = Number(searchParams.get('month')) || today.getMonth() + 1;
  const setPeriod = (next: { year: number; month: number }) => setSearchParams({ year: String(next.year), month: String(next.month) }, { replace: true });

  const actions = usePayrollActions();
  const params = { type, id, year, month };
  const query = useQuery({ queryKey: queryKeys.salaries.profile(params), queryFn: () => salaryService.profile(params) });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-72 rounded-card" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />;

  const profile = query.data;
  const { payee, current } = profile;
  const fullName = `${payee.firstName} ${payee.lastName}`;
  const calculatePayee = () => actions.calculate.mutate({ year, month, ...(type === 'TEACHER' ? { teacherProfileId: id } : { employeeId: id }) });

  const meta: ProfileMetaItem[] = [
    { name: 'Lavozim', icon: Layers, label: payee.roleLabel },
    ...(payee.branch ? [{ name: 'Filial', icon: Building2, label: payee.branch.name }] : []),
    ...(payee.department ? [{ name: 'Bo‘lim', icon: Layers, label: payee.department }] : []),
    ...(payee.since ? [{ name: 'Ishga kirgan', icon: CalendarDays, label: `${formatDate(payee.since)} dan` }] : []),
  ];

  return (
    <>
      <ProfileHeader
        back={BACK}
        firstName={payee.firstName}
        lastName={payee.lastName}
        title={fullName}
        documentTitle={`${fullName} — maosh`}
        badges={
          current ? (
            <>
              <Badge tone={SALARY_STATUS_TONES[current.status]}>{SALARY_STATUS_LABELS[current.status]}</Badge>
              <Badge tone={PAYMENT_STATE_TONES[paymentStateOf(current)]}>{PAYMENT_STATE_LABELS[paymentStateOf(current)]}</Badge>
            </>
          ) : (
            <Badge tone="neutral">Hisoblanmagan</Badge>
          )
        }
        meta={meta}
        actions={<PrimaryActions current={current} actions={actions} onCalculate={calculatePayee} calculating={actions.calculate.isPending} fullName={fullName} />}
        stats={
          <>
            <ProfileStat label="Jami" value={current ? formatMoney(current.totalAmount) : '—'} hint={current?.label} />
            <ProfileStat label="To‘langan" value={current ? formatMoney(current.paidAmount) : '—'} hint={current ? `qolgan ${formatMoney(current.remainingAmount)}` : undefined} />
            {type === 'EMPLOYEE' ? (
              <ProfileStat
                label="KPI bajarilishi"
                value={(current?.kpiDetails ?? profile.kpiPreview)?.achievement != null ? `${formatNumber((current?.kpiDetails ?? profile.kpiPreview)!.achievement!)}%` : '—'}
                hint={current ? `bonus ${formatMoney(current.kpiBonus)}` : 'jonli hisob'}
              />
            ) : (
              <ProfileStat label="Model" value={current ? SALARY_TYPE_LABELS[current.salaryType] : profile.rules[0] ? SALARY_TYPE_LABELS[profile.rules[0].type] : '—'} hint={current && current.commissionRate > 0 ? `${formatNumber(current.commissionRate)}% ulush` : undefined} />
            )}
            <ProfileStat label="Ogohlantirishlar" value={formatNumber(current?.warnings.length ?? 0)} tone={(current?.warnings.length ?? 0) > 0 && !current?.lockedAt ? 'warning' : 'default'} />
          </>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Oldingi oy" onClick={() => setPeriod(shiftMonth(year, month, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-36 text-center text-body font-medium text-fg">
          {MONTH_OPTIONS.find((option) => option.value === month)?.label} {year}
        </span>
        <Button variant="secondary" size="icon" aria-label="Keyingi oy" onClick={() => setPeriod(shiftMonth(year, month, 1))}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {current?.status === 'CALCULATED' && current.rejectReason && (
            <Alert tone="error" title="Direktor rad etgan">
              {current.rejectReason}
              {current.rejectedBy && ` — ${current.rejectedBy.firstName} ${current.rejectedBy.lastName}, ${formatDateTime(current.rejectedAt)}`}
            </Alert>
          )}
          {current && current.warnings.length > 0 && !current.lockedAt && (
            <Alert tone="warning" title="Ko‘rib chiqishda tekshiring">
              <ul className="list-disc space-y-0.5 pl-4">
                {current.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          {current ? (
            <CalculationBreakdown period={current} />
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Wallet2}
                  title="Bu oy maoshi hisoblanmagan"
                  description="Hisoblash kelishilgan model, to‘lovlar va KPI natijalaridan dastlabki maoshni tuzadi — u tasdiqlanmaguncha yakuniy emas"
                  {...(actions.can.calculate
                    ? {
                        action: (
                          <Button leftIcon={<Calculator className="size-4" aria-hidden />} loading={actions.calculate.isPending} onClick={calculatePayee}>
                            Hisoblash
                          </Button>
                        ),
                      }
                    : {})}
                />
              </CardContent>
            </Card>
          )}

          {type === 'EMPLOYEE' && (current?.kpiDetails ?? profile.kpiPreview) && (
            <KpiResultsCard
              evaluation={(current?.kpiDetails ?? profile.kpiPreview)!}
              snapshot={Boolean(current?.kpiDetails)}
              employeeId={id}
              year={year}
              month={month}
              canEnterManual={actions.can.calculate && !current?.lockedAt}
              onChanged={actions.refresh}
            />
          )}

          {profile.sales && <SalesActivityCard sales={profile.sales} />}

          <HistoryCard profile={profile} onSelect={(period) => setPeriod(period)} selected={{ year, month }} />
        </div>

        <div className="space-y-4">
          <AgreementCard profile={profile} canEditPool={actions.can.approve} onChanged={actions.refresh} />
          <Card>
            <CardHeader>
              <CardTitle>O‘zgarishlar tarixi</CardTitle>
              <History className="size-4 text-fg-subtle" aria-hidden />
            </CardHeader>
            <CardContent>
              {profile.timeline.length === 0 ? (
                <p className="text-body text-fg-muted">Hali o‘zgarish yo‘q</p>
              ) : (
                <Timeline
                  label="Maosh o‘zgarishlari"
                  items={profile.timeline.map((item) => ({
                    id: item.id,
                    title: item.label,
                    time: formatDateTime(item.at),
                    ...(item.details ? { description: item.details } : {}),
                    ...(item.actor ? { meta: `${item.actor.firstName} ${item.actor.lastName}` } : {}),
                    tone:
                      item.action === 'salary.approved' || item.action === 'salary.paid'
                        ? ('success' as const)
                        : item.action === 'salary.rejected' || item.action === 'salary.unlocked'
                          ? ('danger' as const)
                          : ('neutral' as const),
                  }))}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {actions.dialogs}
    </>
  );
}

/** Holatga mos bitta asosiy tugma + qolgan amallar "Yana" menyusida */
function PrimaryActions({
  current,
  actions,
  onCalculate,
  calculating,
  fullName,
}: {
  current: SalaryPeriod | null;
  actions: ReturnType<typeof usePayrollActions>;
  onCalculate: () => void;
  calculating: boolean;
  fullName: string;
}) {
  if (!current) {
    return actions.can.calculate ? (
      <Button leftIcon={<Calculator className="size-4" aria-hidden />} loading={calculating} onClick={onCalculate}>
        Hisoblash
      </Button>
    ) : null;
  }
  const primary =
    current.status === 'UNDER_REVIEW' && actions.can.approve ? (
      <>
        <Button variant="secondary" leftIcon={<Undo2 className="size-4" aria-hidden />} onClick={() => actions.openDialog('reject', current)}>
          Rad etish
        </Button>
        <Button leftIcon={<BadgeCheck className="size-4" aria-hidden />} onClick={() => actions.openDialog('approve', current)}>
          Tasdiqlash
        </Button>
      </>
    ) : current.status === 'CALCULATED' && actions.can.calculate ? (
      <Button leftIcon={<Send className="size-4" aria-hidden />} loading={actions.submit.isPending} onClick={() => actions.submit.mutate(current.id)}>
        Tasdiqlashga yuborish
      </Button>
    ) : (current.status === 'APPROVED' || current.status === 'PARTIALLY_PAID') && actions.can.pay ? (
      <Button leftIcon={<HandCoins className="size-4" aria-hidden />} onClick={() => actions.openDialog('pay', current)}>
        To‘lov qilish
      </Button>
    ) : null;
  const primaryLabels = ['Tasdiqlash', 'Rad etish', 'Tasdiqlashga yuborish', 'To‘lov qilish'];
  const rest = actions.itemsFor(current).filter((item) => !(primary && primaryLabels.includes(item.label)));
  return (
    <>
      {primary}
      <ActionMenu label={`${fullName} — boshqa amallar`} trigger={{ label: 'Yana', icon: MoreHorizontal }} items={rest} />
    </>
  );
}

function SalesActivityCard({ sales }: { sales: SalesActivity }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sotuv faoliyati</CardTitle>
        <span className="text-caption text-fg-muted">CRM lead va o‘quvchi yozuvlaridan</span>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard size="sm" title="Biriktirilgan leadlar" value={formatNumber(sales.leadsAssigned)} description="oyda yangi" />
          <StatCard size="sm" title="Bog‘lanilgan" value={formatNumber(sales.leadsContacted)} description="qo‘ng‘iroq qilingan leadlar" />
          <StatCard size="sm" title="Sinov darsiga yozilgan" value={formatNumber(sales.trialsBooked)} />
          <StatCard size="sm" title="Sotuvga aylangan" value={formatNumber(sales.converted)} />
          <StatCard size="sm" title="Jalb qilingan o‘quvchilar" value={formatNumber(sales.acquired.length)} description="birinchi to‘lov shu oyda" />
          <StatCard size="sm" title="Konversiya" value={sales.conversionRate === null ? '—' : `${formatNumber(sales.conversionRate)}%`} />
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ profile, onSelect, selected }: { profile: PayrollProfile; onSelect: (period: { year: number; month: number }) => void; selected: { year: number; month: number } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Maosh tarixi</CardTitle>
        <span className="text-caption text-fg-muted">oxirgi 12 oy</span>
      </CardHeader>
      <CardContent className="p-0">
        {profile.history.length === 0 ? (
          <p className="px-5 pb-5 text-body text-fg-muted">Hali hisoblangan oy yo‘q</p>
        ) : (
          <ul className="divide-y divide-border">
            {profile.history.map((period) => {
              const active = period.year === selected.year && period.month === selected.month;
              return (
                <li key={period.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ year: period.year, month: period.month })}
                    aria-current={active ? 'true' : undefined}
                    className={cn('flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors', active ? 'bg-primary-subtle' : 'hover:bg-surface-muted')}
                  >
                    <span className="min-w-0">
                      <span className="block text-body text-fg">{period.label}</span>
                      {period.kpiBonus > 0 && <span className="block text-caption text-fg-subtle">KPI bonusi {formatMoney(period.kpiBonus)}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge tone={SALARY_STATUS_TONES[period.status]}>{SALARY_STATUS_LABELS[period.status]}</Badge>
                      <span className="w-32 text-right text-body font-medium text-fg tabular-nums">{formatMoney(period.totalAmount)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AgreementCard({ profile, canEditPool, onChanged }: { profile: PayrollProfile; canEditPool: boolean; onChanged: () => void }) {
  const [editPool, setEditPool] = useState(false);
  const rule = profile.rules.find((item) => item.isActive) ?? profile.rules[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Maosh kelishuvi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile.payee.type === 'TEACHER' ? (
          rule ? (
            <>
              <dl className="space-y-2 text-body">
                <Row label="Model" value={SALARY_TYPE_LABELS[rule.type]} />
                {rule.percentage > 0 && <Row label="Tushumdan ulush" value={`${formatNumber(rule.percentage)}%`} />}
                {rule.baseSalary > 0 && <Row label="Asosiy maosh" value={formatMoney(rule.baseSalary)} />}
                {rule.perLessonRate > 0 && <Row label="Dars uchun" value={formatMoney(rule.perLessonRate)} />}
                {rule.perStudentRate > 0 && <Row label="O‘quvchi uchun" value={formatMoney(rule.perStudentRate)} />}
                {rule.bonus > 0 && <Row label="Oylik bonus" value={formatMoney(rule.bonus)} />}
                <Row label="Amal qiladi" value={`${formatDate(rule.effectiveFrom)} dan${rule.effectiveTo ? ` ${formatDate(rule.effectiveTo)} gacha` : ''}`} />
              </dl>
              {rule.percentage > 0 && (
              <p className="text-caption text-fg-subtle">
                Ulush faqat haqiqatda tushgan to‘lovlardan hisoblanadi: bitta to‘lov bir marta, bekor qilingan yoki qaytarilgan to‘lov foizi
                ayiriladi.
              </p>
              )}
              {profile.rules.length > 1 && (
                <details className="text-caption text-fg-muted">
                  <summary className="cursor-pointer text-primary">Avvalgi modellar ({formatNumber(profile.rules.length - 1)})</summary>
                  <ul className="mt-2 space-y-1">
                    {profile.rules.slice(1).map((item) => (
                      <li key={item.id}>
                        {formatDate(item.effectiveFrom)} — {SALARY_TYPE_LABELS[item.type]}
                        {item.percentage > 0 ? ` · ${formatNumber(item.percentage)}%` : ''}
                        {item.baseSalary > 0 ? ` · ${formatMoney(item.baseSalary)}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-body text-fg-muted">Maosh modeli belgilanmagan — o‘qituvchi sahifasida belgilang.</p>
          )
        ) : (
          <>
            <dl className="space-y-2 text-body">
              <Row label="Belgilangan maosh" value={formatMoney(profile.employeeTerms?.baseSalary ?? 0)} />
              <Row
                label="KPI bonus fondi"
                value={
                  <span className="inline-flex items-center gap-2">
                    {formatMoney(profile.employeeTerms?.kpiBonusPool ?? 0)}
                    {canEditPool && (
                      <button type="button" onClick={() => setEditPool(true)} className="focus-ring rounded-chip text-caption text-primary hover:underline">
                        o‘zgartirish
                      </button>
                    )}
                  </span>
                }
              />
            </dl>
            <div>
              <p className="mb-1 text-overline text-fg-subtle uppercase">Lavozim KPI'lari</p>
              {profile.kpis.length === 0 ? (
                <p className="text-body text-fg-muted">KPI belgilanmagan</p>
              ) : (
                <ul className="space-y-1 text-body">
                  {profile.kpis.map((kpi) => (
                    <li key={kpi.id} className="flex justify-between gap-2">
                      <span className="truncate text-fg">{kpi.name}</span>
                      <span className="shrink-0 text-fg-muted tabular-nums">
                        {formatKpiValue(kpi.target, kpi.unit)} · {formatNumber(kpi.weight)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/salaries/kpi" className="mt-2 inline-block text-caption text-primary hover:underline">
                KPI sozlamalari
              </Link>
            </div>
          </>
        )}
      </CardContent>
      {editPool && profile.employeeTerms && (
        <KpiPoolModal
          employeeId={profile.payee.id}
          name={`${profile.payee.firstName} ${profile.payee.lastName}`}
          initial={profile.employeeTerms.kpiBonusPool}
          onClose={() => setEditPool(false)}
          onSaved={() => {
            setEditPool(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right font-medium text-fg tabular-nums">{value}</dd>
    </div>
  );
}
