import { BookOpen, CalendarCheck, GraduationCap, HandCoins, Layers, Target, TrendingDown, TrendingUp, UserMinus, UserPlus, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import type { StatTone, StatTrend } from '@/components/ui/StatCard';
import type { ExecutiveChangeKey, ExecutiveSummary } from '@/types/dashboard';
import { formatMoney, formatNumber } from '@/utils/format';

interface KpiDefinition {
  key: string;
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  to: string;
  tone?: StatTone;
  /** `inverse` — kamayishi yaxshi (xarajat, ketganlar); `points` — foiz punkti (marja, davomat, konversiya) */
  change?: { key: ExecutiveChangeKey; inverse?: boolean; points?: boolean };
}

/**
 * Oldingi davrga nisbatan o'zgarish → `StatCard` trendi.
 * `null` — solishtirib bo'lmaydi (oldingi davrda ma'lumot yo'q), `0` — o'zgarmagan.
 */
export function changeTrend(value: number | null, options: { inverse?: boolean; points?: boolean } = {}): { trend: StatTrend | null; note: string | null } {
  if (value === null) return { trend: null, note: 'solishtirish yo‘q' };
  if (value === 0) return { trend: { label: 'o‘zgarmadi', direction: 'flat' }, note: null };
  return {
    trend: {
      label: `${value > 0 ? '+' : '−'}${Math.abs(value)}${options.points ? ' p.' : '%'}`,
      direction: value > 0 ? 'up' : 'down',
      positive: !options.inverse,
    },
    note: null,
  };
}

export function buildKpis(data: ExecutiveSummary): KpiDefinition[] {
  const { kpi, month } = data;
  return [
    { key: 'revenue', label: 'Sof tushum', value: formatMoney(kpi.monthRevenue), icon: TrendingUp, to: '/finance', tone: 'success', change: { key: 'revenue' } },
    { key: 'expense', label: 'Xarajat', value: formatMoney(kpi.monthExpense), icon: TrendingDown, to: '/expenses', change: { key: 'expense', inverse: true } },
    {
      key: 'profit',
      label: 'Sof foyda',
      value: formatMoney(kpi.netProfit),
      hint: `marja ${month.margin}%`,
      icon: Wallet,
      to: '/finance',
      tone: kpi.netProfit >= 0 ? 'success' : 'danger',
      change: { key: 'netProfit' },
    },
    {
      key: 'debt',
      label: 'Qarzdorlik',
      value: formatMoney(kpi.totalDebt),
      hint: 'hozirgi holat',
      icon: HandCoins,
      to: '/debts',
      tone: kpi.totalDebt > 0 ? 'danger' : 'neutral',
    },
    {
      key: 'students',
      label: 'Faol o‘quvchilar',
      value: formatNumber(kpi.activeStudents),
      hint: `jami ${formatNumber(kpi.totalStudents)}`,
      icon: GraduationCap,
      to: '/students',
      tone: 'primary',
    },
    { key: 'new-students', label: 'Yangi o‘quvchilar', value: formatNumber(kpi.newStudents), icon: UserPlus, to: '/students', change: { key: 'newStudents' } },
    {
      key: 'dropped',
      label: 'Ketgan o‘quvchilar',
      value: formatNumber(kpi.droppedStudents),
      icon: UserMinus,
      to: '/students',
      tone: kpi.droppedStudents > 0 ? 'danger' : 'neutral',
      change: { key: 'droppedStudents', inverse: true },
    },
    {
      key: 'attendance',
      label: 'Davomat',
      value: month.attendanceMarks > 0 ? `${kpi.attendanceRate}%` : '—',
      icon: CalendarCheck,
      to: '/attendance',
      tone: month.attendanceMarks === 0 ? 'neutral' : kpi.attendanceRate >= 85 ? 'success' : 'danger',
      change: { key: 'attendanceRate', points: true },
    },
    {
      key: 'leads',
      label: 'Yangi leadlar',
      value: formatNumber(month.newLeads),
      hint: `sotildi: ${formatNumber(month.wonLeads)}`,
      icon: Target,
      to: '/leads',
      change: { key: 'newLeads' },
    },
    { key: 'conversion', label: 'Sotuv konversiyasi', value: `${kpi.salesConversion}%`, icon: Target, to: '/leads', change: { key: 'conversionRate', points: true } },
    {
      key: 'groups',
      label: 'Guruh / o‘qituvchi',
      value: `${formatNumber(kpi.activeGroups)} / ${formatNumber(kpi.totalTeachers)}`,
      hint: `jami guruh: ${formatNumber(kpi.totalGroups)}`,
      icon: Layers,
      to: '/groups',
    },
    {
      key: 'salary',
      label: 'Hisoblangan maosh',
      value: formatMoney(month.salaryAccrued),
      hint: `to‘langan: ${formatMoney(month.salaryPaid)}`,
      icon: BookOpen,
      to: '/salaries',
    },
  ];
}

/** Ko'rsatkichlar yo'nalish bo'yicha uch qatorda — har qator o'z sarlavhasi bilan, ko'z bir qarashda bo'limni topadi */
const KPI_GROUPS: ReadonlyArray<{ title: string; keys: readonly string[] }> = [
  { title: 'Moliya', keys: ['revenue', 'expense', 'profit', 'debt'] },
  { title: 'O‘quvchilar', keys: ['students', 'new-students', 'dropped', 'attendance'] },
  { title: 'Sotuv va resurslar', keys: ['leads', 'conversion', 'groups', 'salary'] },
];

/** 12 ta asosiy ko'rsatkich — har biri bo'limiga havola, oldingi davr bilan solishtirilgan */
export function ExecutiveKpiGrid({ data }: { data: ExecutiveSummary }) {
  const kpis = buildKpis(data);
  const grouped = new Set(KPI_GROUPS.flatMap((group) => group.keys));
  // Guruhga kiritilmagan ko'rsatkich (yangi qo'shilsa) yo'qolib qolmasin — oxirgi qatorga tushadi
  const groups = [...KPI_GROUPS.map((group) => ({ title: group.title, items: kpis.filter((kpi) => group.keys.includes(kpi.key)) })), { title: 'Boshqa', items: kpis.filter((kpi) => !grouped.has(kpi.key)) }].filter((group) => group.items.length > 0);
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2 className="mb-2 text-overline text-fg-subtle uppercase">{group.title}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {group.items.map((kpi) => {
              const { trend, note } = kpi.change ? changeTrend(data.changes[kpi.change.key], kpi.change) : { trend: null, note: null };
              const description = [note, kpi.hint].filter(Boolean).join(' · ');
              return (
                <StatCard
                  key={kpi.key}
                  size="sm"
                  title={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  to={kpi.to}
                  trend={trend}
                  {...(kpi.tone ? { tone: kpi.tone } : {})}
                  {...(description ? { description } : {})}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
