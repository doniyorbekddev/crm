import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { Banknote, Boxes, BriefcaseBusiness, ClipboardList, Fingerprint, GraduationCap, Megaphone, MessageSquareWarning, PiggyBank, ShieldCheck, Target, TrendingUp, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { orgService } from '@/services/org.service';
import { formatDateTime, formatMoney } from '@/utils/format';

/**
 * Tashkilot paneli (ORG §15, texnik spetsifikatsiya §10): bugungi davomat va istisnolar, jamoa, vazifalar,
 * KPI, akademik, sotuv, marketing, to‘lov va qarzdorlik, maosh, xarajatlar, murojaatlar, aktivlar va rahbar
 * qarorini kutayotganlar. Har blok foydalanuvchi ruxsatiga qarab ko‘rinadi.
 */
export default function OrgOverviewPage() {
  const query = useQuery({ queryKey: ['org', 'overview'], queryFn: orgService.overview, refetchInterval: 120_000 });
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Tashkilot paneli" description="Markaz holati bitta oynada: jamoa, ish, natija va pul" />
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        Object.entries(data).every(([key, value]) => key === 'date' || value === null) ? (
          <EmptyState icon={ShieldCheck} title="Ko‘rsatkich yo‘q" description="Sizga panel bloklari uchun ruxsat berilmagan" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.approvals && (
              <Widget icon={ShieldCheck} title="Qaroringizni kutmoqda" link="/my-work">
                <Metric label="Xarajat" value={data.approvals.expenses} tone={data.approvals.expenses ? 'warning' : undefined} />
                <Metric label="Chegirma" value={data.approvals.discounts} tone={data.approvals.discounts ? 'warning' : undefined} />
                <Metric label="Baholash" value={data.approvals.reviews} />
                <Metric label="Ko‘tarilish" value={data.approvals.promotions} />
                <Metric label="Nomzod (taklif bosqichi)" value={data.approvals.candidates} />
              </Widget>
            )}
            {data.attendance && (
              <Widget icon={Fingerprint} title="Bugungi davomat" link="/staff-attendance">
                <Metric label="Kutilmoqda" value={data.attendance.expected} />
                <Metric label="Hozir ishda" value={data.attendance.working} />
                <Metric label="O‘z vaqtida" value={data.attendance.onTime} />
                <Metric label="Kechikkan" value={data.attendance.late} tone={data.attendance.late ? 'warning' : undefined} />
                <Metric label="Hali kelmagan" value={data.attendance.notArrived} />
                <Metric label="Kelmagan" value={data.attendance.absent} tone={data.attendance.absent ? 'danger' : undefined} />
                <Metric label="Tekshiruv kerak" value={data.attendance.review} tone={data.attendance.review ? 'danger' : undefined} />
                {data.attendance.lateNames.length > 0 && <p className="col-span-2 text-caption text-fg-muted">Kechikkanlar: {data.attendance.lateNames.join(', ')}</p>}
              </Widget>
            )}
            {data.team && (
              <Widget icon={Users} title="Jamoa" link="/org-structure">
                <Metric label="Xodimlar" value={data.team.employees} />
                <Metric label="O‘qituvchilar" value={data.team.teachers} />
                <Metric label="Bugun ta’tilda" value={data.team.onLeave} />
                <Metric label="Sinov muddatida" value={data.team.onProbation} />
                <Metric label="CRM hisobi yo‘q" value={data.team.withoutAccount} tone={data.team.withoutAccount ? 'warning' : undefined} />
                <Metric label="Vakant lavozim" value={data.team.vacancies} />
              </Widget>
            )}
            {data.tasks && (
              <Widget icon={ClipboardList} title="Vazifalar" link="/tasks?scope=all">
                <Metric label="Yangi" value={data.tasks.open} />
                <Metric label="Jarayonda" value={data.tasks.inProgress} />
                <Metric label="Tekshiruvda" value={data.tasks.review} />
                <Metric label="Muddati o‘tgan" value={data.tasks.overdue} tone={data.tasks.overdue ? 'danger' : undefined} />
                <Metric label="Shu oy bajarildi" value={data.tasks.doneThisMonth} />
                {data.tasks.overdueItems.length > 0 && (
                  <ul className="col-span-2 space-y-1 text-caption text-fg-muted">
                    {data.tasks.overdueItems.map((item) => (
                      <li key={item.id}>
                        {item.title} — {item.assignee} · {formatDateTime(item.dueAt)}
                      </li>
                    ))}
                  </ul>
                )}
              </Widget>
            )}
            {data.kpi && (
              <Widget icon={Target} title={`KPI natijalari · ${data.kpi.month}`} link="/payroll">
                <Metric label="Baholangan xodim" value={data.kpi.evaluated} />
                <Metric label="O‘rtacha bajarilish" value={data.kpi.averageAchievement !== null ? `${data.kpi.averageAchievement}%` : '—'} />
                {data.kpi.below.length > 0 && <p className="col-span-2 text-caption text-warning">70% dan past: {data.kpi.below.map((row) => `${row.name} (${row.achievement}%)`).join(', ')}</p>}
              </Widget>
            )}
            {data.academic && (
              <Widget icon={GraduationCap} title="Akademik ko‘rsatkichlar" link="/analytics">
                <Metric label="Faol o‘quvchi" value={data.academic.activeStudents} />
                <Metric label="Faol guruh" value={data.academic.activeGroups} />
                <Metric label="Davomat (oy)" value={`${data.academic.attendanceRate}%`} />
                <Metric label="Yangi / ketgan" value={`${data.academic.newStudents} / ${data.academic.droppedStudents}`} tone={data.academic.droppedStudents > data.academic.newStudents ? 'warning' : undefined} />
              </Widget>
            )}
            {data.sales && (
              <Widget icon={TrendingUp} title="Sotuv (shu oy)" link="/leads">
                <Metric label="Yangi lead" value={data.sales.newLeads} />
                <Metric label="Sotildi" value={data.sales.wonLeads} />
                <Metric label="Konversiya" value={`${data.sales.conversionRate}%`} />
              </Widget>
            )}
            {data.marketing && (
              <Widget icon={Megaphone} title="Marketing (shu oy)" link="/analytics">
                <Metric label="Reklama xarajati" value={formatMoney(data.marketing.spend)} />
                <Metric label="Leadlar" value={data.marketing.leads} />
                <Metric label="CPL" value={data.marketing.costPerLead !== null ? formatMoney(data.marketing.costPerLead) : '—'} />
                <Metric label="CAC" value={data.marketing.cac !== null ? formatMoney(data.marketing.cac) : '—'} />
                <Metric label="ROI" value={data.marketing.roi !== null ? `${data.marketing.roi}%` : '—'} />
              </Widget>
            )}
            {data.payments && (
              <Widget icon={Wallet} title="To‘lovlar va qarzdorlik" link="/debts">
                <Metric label="Shu oy tushum" value={formatMoney(data.payments.revenue)} />
                <Metric label="Umumiy qarz" value={formatMoney(data.payments.totalDebt)} tone={data.payments.totalDebt ? 'warning' : undefined} />
              </Widget>
            )}
            {data.payroll && (
              <Widget icon={Banknote} title="Maosh (shu oy)" link="/payroll">
                <Metric label="Hisoblangan" value={formatMoney(data.payroll.accrued)} />
                <Metric label="To‘langan" value={formatMoney(data.payroll.paid)} />
                <Metric label="Qolgan" value={formatMoney(data.payroll.remaining)} />
              </Widget>
            )}
            {data.expenses && (
              <Widget icon={PiggyBank} title="Xarajatlar (shu oy)" link="/expenses">
                <Metric label="Jami" value={formatMoney(data.expenses.total)} />
                <Metric label="Tasdiq kutmoqda" value={data.expenses.pendingApprovals} tone={data.expenses.pendingApprovals ? 'warning' : undefined} />
                {data.expenses.overLimit.length > 0 && <p className="col-span-2 text-caption text-danger">Limitdan oshgan: {data.expenses.overLimit.map((row) => `${row.name} (${formatMoney(row.spent)} / ${formatMoney(row.limit)})`).join(', ')}</p>}
              </Widget>
            )}
            {data.complaints && (
              <Widget icon={MessageSquareWarning} title="Ochiq murojaatlar" link="/complaints">
                <Metric label="Ochiq" value={data.complaints.open} />
                <Metric label="Yangi" value={data.complaints.newCount} />
                <Metric label="Muddati o‘tgan" value={data.complaints.overdue} tone={data.complaints.overdue ? 'danger' : undefined} />
                <Metric label="Jiddiy" value={data.complaints.critical} tone={data.complaints.critical ? 'danger' : undefined} />
                <Metric label="CEOga ko‘tarilgan" value={data.complaints.escalated} />
              </Widget>
            )}
            {data.assets && (
              <Widget icon={Boxes} title="Aktivlar" link="/assets">
                <Metric label="Balansda" value={data.assets.count} />
                <Metric label="Qiymati" value={formatMoney(data.assets.value)} />
                <Metric label="Ta’mirda" value={data.assets.underRepair} tone={data.assets.underRepair ? 'warning' : undefined} />
              </Widget>
            )}
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="flex flex-wrap items-center gap-2 p-4 text-caption text-fg-subtle">
                <BriefcaseBusiness className="size-4" aria-hidden />
                Moliya, sotuv va akademik raqamlar “Direktor paneli” bilan bir xil hisoblanadi. Panel har 2 daqiqada yangilanadi.
              </CardContent>
            </Card>
          </div>
        )
      ) : null}
    </div>
  );
}

function Widget({ icon: Icon, title, link, children }: { icon: LucideIcon; title: string; link: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-fg-subtle" aria-hidden />
          {title}
        </CardTitle>
        <Link to={link} className="text-caption text-primary hover:underline">
          Ochish
        </Link>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' | 'danger' }) {
  return (
    <div>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className={tone === 'danger' ? 'text-h4 text-danger' : tone === 'warning' ? 'text-h4 text-warning' : 'text-h4 text-fg'}>
        {value}
        {tone === 'danger' && typeof value === 'number' && value > 0 ? (
          <Badge tone="red" className="ml-2 align-middle">
            !
          </Badge>
        ) : null}
      </dd>
    </div>
  );
}
