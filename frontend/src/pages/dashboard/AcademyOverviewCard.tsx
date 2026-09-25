import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import type { AcademyOverview, ExecutiveKpi } from '@/types/dashboard';
import { formatMoney, formatNumber } from '@/utils/format';

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
  to: string | null;
  tone?: 'warning' | 'danger';
}

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** Moliya, sotuv va o'quvchilar — `executive.summary` dan; qolgani — akademiya holatidan */
export function buildAcademyTiles(kpi: ExecutiveKpi, overview: AcademyOverview): Tile[] {
  const { parents, homework, exams, progress, risk, marketing, telegram, ai } = overview;
  const atRisk = risk.atRisk + risk.critical;
  return [
    { key: 'students', label: 'O‘quvchilar', value: formatNumber(kpi.activeStudents), hint: `jami ${formatNumber(kpi.totalStudents)}`, to: '/students' },
    { key: 'parents', label: 'Ota-onalar', value: formatNumber(parents.total), hint: `kabinet ${formatNumber(parents.withPortal)} · Telegram ${formatNumber(parents.telegramLinked)}`, to: '/parents' },
    { key: 'teachers', label: 'O‘qituvchilar', value: formatNumber(kpi.totalTeachers), hint: 'faol profil', to: '/teachers' },
    { key: 'courses', label: 'Kurslar', value: formatNumber(overview.courses.active), hint: 'faol', to: '/courses' },
    { key: 'groups', label: 'Guruhlar', value: formatNumber(overview.groups.active), hint: `rejada ${formatNumber(overview.groups.planned)}`, to: '/groups' },
    { key: 'attendance', label: 'Davomat', value: pct(overview.attendance.rate), hint: `${formatNumber(overview.attendance.marked)} belgi`, to: '/attendance' },
    {
      key: 'homework',
      label: 'Uy vazifalari',
      value: pct(homework.submissionRate),
      hint: `ochiq ${formatNumber(homework.open)} · baholash kutmoqda ${formatNumber(homework.toGrade)}`,
      to: '/homework',
      ...(homework.toGrade > 0 ? { tone: 'warning' as const } : {}),
    },
    {
      key: 'exams',
      label: 'Imtihonlar',
      value: pct(exams.averagePercentage),
      hint: `o‘tkazildi ${formatNumber(exams.held)} · tekshiruvda ${formatNumber(exams.needsReview)}`,
      to: '/exams',
      ...(exams.needsReview > 0 ? { tone: 'warning' as const } : {}),
    },
    { key: 'progress', label: 'Akademik progress', value: pct(progress.averageMastery), hint: `o‘zlashtirilgan mavzular ${pct(progress.masteredShare)}`, to: '/academic-analytics' },
    {
      key: 'risk',
      label: 'Xavf ostida',
      value: formatNumber(atRisk),
      hint: `kritik ${formatNumber(risk.critical)} · e’tibor ${formatNumber(risk.attention)} · sog‘lom ${formatNumber(risk.healthy)}`,
      to: '/teaching',
      ...(risk.critical > 0 ? { tone: 'danger' as const } : atRisk > 0 ? { tone: 'warning' as const } : {}),
    },
    { key: 'finance', label: 'Moliya', value: formatMoney(kpi.monthRevenue), hint: `qarzdorlik ${formatMoney(kpi.totalDebt)}`, to: '/finance' },
    { key: 'sales', label: 'Sotuv', value: pct(kpi.salesConversion), hint: `${formatNumber(marketing.won)} ta sotuv`, to: '/leads' },
    { key: 'marketing', label: 'Marketing', value: formatNumber(marketing.leads), hint: marketing.topSource ? `eng ko‘p: ${marketing.topSource.name} (${formatNumber(marketing.topSource.leads)})` : 'lead yo‘q', to: '/analytics' },
    {
      key: 'telegram',
      label: 'Telegram',
      value: formatNumber(telegram.linkedChats),
      hint: `navbatda ${formatNumber(telegram.queued)} · 24 soatda xato ${formatNumber(telegram.failed)}`,
      to: null,
      ...(telegram.failed > 0 ? { tone: 'warning' as const } : {}),
    },
    { key: 'ai', label: 'AI', value: formatNumber(ai.analyses), hint: `${ai.mode === 'LLM' ? 'Claude' : 'qoidalar rejimi'} · qaror kutmoqda ${formatNumber(ai.awaitingDecision)}`, to: '/assistant' },
  ];
}

function TileBody({ tile }: { tile: Tile }) {
  return (
    <>
      <p className="text-xs text-fg-muted">{tile.label}</p>
      <p
        className={cn(
          'mt-1 text-lg font-semibold tabular-nums',
          tile.tone === 'danger' ? 'text-red-600 dark:text-red-400' : tile.tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-fg',
        )}
      >
        {tile.value}
      </p>
      <p className="mt-0.5 truncate text-xs text-fg-subtle" title={tile.hint}>
        {tile.hint}
      </p>
    </>
  );
}

/** TZ 3.0 §76: rahbar bitta paneldan barcha yo'nalish holatini ko'radi va bosib bo'limga o'tadi */
export function AcademyOverviewCard({ kpi }: { kpi: ExecutiveKpi }) {
  const query = useQuery({ queryKey: queryKeys.dashboard.academy, queryFn: () => dashboardService.academy() });

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Akademiya holati</CardTitle>
        {query.data && <span className="text-xs text-fg-muted">oxirgi {query.data.windowDays} kun</span>}
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Yo‘nalishlar">
            {buildAcademyTiles(kpi, query.data).map((tile) => (
              <li key={tile.key} className="min-w-0">
                {tile.to ? (
                  <Link to={tile.to} className="block h-full rounded-xl border border-border p-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand-500">
                    <TileBody tile={tile} />
                  </Link>
                ) : (
                  <div className="h-full rounded-xl border border-border p-3">
                    <TileBody tile={tile} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
