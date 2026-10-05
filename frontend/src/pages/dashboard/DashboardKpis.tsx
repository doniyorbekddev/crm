import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  FileCheck,
  GraduationCap,
  HandCoins,
  Landmark,
  PiggyBank,
  Target,
  TrendingUp,
  UserX,
  Wallet,
  Wallet2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import type { DashboardSummary } from '@/types/dashboard';
import { formatMoney, formatNumber } from '@/utils/format';

/** "(o‘tgan oyga nisbatan +12%)" — solishtiradigan narsa bo'lmasa (ikkala oy ham bo'sh) hech narsa */
function growthNote(current: number, growth: number): string {
  if (current === 0 && growth === 0) return '';
  return ` (o‘tgan oyga nisbatan ${growth > 0 ? '+' : growth < 0 ? '−' : ''}${Math.abs(growth)}%)`;
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-overline text-fg-subtle uppercase">{title}</h2>
      {/* Ustunlar soni kenglikka qarab: 5 ta karta bir qatorga sig'adi, bitta karta cho'zilib ketmaydi */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]">{children}</div>
    </section>
  );
}

/**
 * Asosiy ko'rsatkichlar — yo'nalish bo'yicha guruhlangan (o'qitish, sotuv, moliya, o'quvchilar).
 * Har blok faqat backend qaytarganda chiqadi (ruxsatga bog'liq) — bu yerda hisob-kitob yo'q.
 * Qiymat rangi doim neytral; holat ikonka ohangi va izohda.
 */
export function DashboardKpis({ summary }: { summary: DashboardSummary }) {
  const { teaching, leads, tasks, finance, debts, money, students } = summary;
  const unmarked = teaching ? teaching.todayLessons - teaching.markedLessons : 0;

  return (
    <div className="space-y-5">
      {teaching && (
        <Group title="O‘qitish">
          <StatCard
            size="sm"
            icon={CalendarCheck}
            title="Bugungi darslar"
            value={`${formatNumber(teaching.markedLessons)} / ${formatNumber(teaching.todayLessons)}`}
            description={unmarked > 0 ? `${formatNumber(unmarked)} ta darsda davomat belgilanmagan` : 'Davomat belgilangan'}
            tone={unmarked > 0 ? 'danger' : 'success'}
            to="/attendance"
          />
          <StatCard
            size="sm"
            icon={UserX}
            title="Bugun kelmaganlar"
            value={formatNumber(teaching.todayAbsent)}
            description={`Oylik davomat: ${teaching.monthAttendanceRate}%`}
            tone={teaching.todayAbsent > 0 ? 'danger' : 'neutral'}
            to="/attendance"
          />
          <StatCard
            size="sm"
            icon={ClipboardCheck}
            title="Baholash kutmoqda"
            value={formatNumber(teaching.pendingGrading)}
            description="Topshirilgan, ball qo‘yilmagan vazifalar"
            tone={teaching.pendingGrading > 0 ? 'warning' : 'neutral'}
            to="/homework"
          />
          <StatCard
            size="sm"
            icon={FileCheck}
            title="Yaqin imtihonlar"
            value={formatNumber(teaching.upcomingExams)}
            description={`${formatNumber(teaching.groups)} guruh · ${formatNumber(teaching.students)} o‘quvchi`}
            to="/exams"
          />
        </Group>
      )}

      {(leads || tasks) && (
        <Group title="Sotuv">
          {leads && (
            <>
              <StatCard
                size="sm"
                icon={Target}
                title="Bugungi yangi leadlar"
                value={formatNumber(leads.todayNew)}
                description={`Shu oyda: ${formatNumber(leads.monthNew)}${growthNote(leads.monthNew, leads.monthNewGrowth)}`}
                tone="primary"
                to="/leads"
              />
              <StatCard
                size="sm"
                icon={TrendingUp}
                title="Oylik konversiya"
                value={`${leads.conversionRate}%`}
                description={`Sotildi: ${formatNumber(leads.monthWon)} · Yo‘qotildi: ${formatNumber(leads.monthLost)}`}
                tone={leads.conversionRate >= 50 ? 'success' : 'neutral'}
              />
              <StatCard size="sm" icon={Target} title="Ishlanayotgan leadlar" value={formatNumber(leads.open)} description="Yopilmagan sotuv jarayonlari" to="/leads" />
            </>
          )}
          {tasks && (
            <>
              <StatCard
                size="sm"
                icon={CalendarClock}
                title="Bugungi follow-up"
                value={formatNumber(tasks.todayFollowUps)}
                description={`Bugungi qo‘ng‘iroqlar: ${formatNumber(tasks.todayCalls)}`}
                to="/follow-ups"
              />
              <StatCard
                size="sm"
                icon={AlertTriangle}
                title="Kechikkan follow-up"
                value={formatNumber(tasks.overdueFollowUps)}
                description={tasks.overdueFollowUps > 0 ? 'Darhol bog‘laning' : 'Kechikkani yo‘q'}
                tone={tasks.overdueFollowUps > 0 ? 'danger' : 'success'}
                to="/follow-ups"
              />
            </>
          )}
        </Group>
      )}

      {(finance || debts || money) && (
        <Group title="Moliya">
          {finance && (
            <StatCard
              size="sm"
              icon={Wallet}
              title="Bugungi tushum"
              value={formatMoney(finance.todayRevenue)}
              trend={{ label: `${Math.abs(finance.monthGrowth)}%`, direction: finance.monthGrowth >= 0 ? 'up' : 'down' }}
              description={`Shu oyda: ${formatMoney(finance.monthRevenue)}`}
              tone="success"
              to="/payments"
            />
          )}
          {debts && (
            <StatCard
              size="sm"
              icon={HandCoins}
              title="Umumiy qarzdorlik"
              value={formatMoney(debts.totalRemaining)}
              description={`${formatNumber(debts.debtors)} ta qarzdor`}
              tone={debts.totalRemaining > 0 ? 'danger' : 'success'}
              to="/debts"
            />
          )}
          {money && (
            <>
              <StatCard
                size="sm"
                icon={PiggyBank}
                title="Oylik sof foyda"
                value={formatMoney(money.monthNetProfit)}
                description={`Tushum ${formatMoney(money.monthIncome)} · xarajat ${formatMoney(money.monthExpense)}`}
                tone={money.monthNetProfit >= 0 ? 'success' : 'danger'}
                to="/finance"
              />
              <StatCard size="sm" icon={Landmark} title="Kassalardagi qoldiq" value={formatMoney(money.cashBalance)} to="/finance" />
              {money.salaryDue !== null && (
                <StatCard
                  size="sm"
                  icon={Wallet2}
                  title="To‘lanishi kerak maosh"
                  value={formatMoney(money.salaryDue)}
                  description={`Tasdiq kutmoqda: ${formatNumber(money.salaryAwaitingApproval ?? 0)}`}
                  to="/salaries"
                />
              )}
            </>
          )}
        </Group>
      )}

      {students && (
        <Group title="O‘quvchilar">
          <StatCard
            size="sm"
            icon={GraduationCap}
            title="Faol o‘quvchilar"
            value={formatNumber(students.active)}
            description={`Shu oyda qo‘shilgan: ${formatNumber(students.monthNew)}${growthNote(students.monthNew, students.monthNewGrowth)} · Muzlatilgan: ${formatNumber(students.frozen)}`}
            tone="primary"
            to="/students"
          />
        </Group>
      )}
    </div>
  );
}
