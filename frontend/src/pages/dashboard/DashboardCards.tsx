import { useQuery } from '@tanstack/react-query';
import { CalendarClock, History, Phone, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { activityService } from '@/services/activity.service';
import { dashboardService } from '@/services/dashboard.service';
import { leadsService } from '@/services/leads.service';
import { debtsService } from '@/services/payments.service';
import type { ManagerPeriod } from '@/types/dashboard';
import type { LeadListParams } from '@/types/lead';
import type { DebtListParams } from '@/types/payment';
import { formatDateTime, formatMoney, formatNumber, formatPhone, formatRelativeTime } from '@/utils/format';
import { LEAD_STATUS_LABELS, leadFullName } from '@/utils/leadLabels';
import { CardLink, ListSkeleton, ProgressBar } from './parts';

const MANAGER_PERIODS: ReadonlyArray<{ value: ManagerPeriod; label: string }> = [
  { value: 'month', label: 'Shu oy' },
  { value: 'quarter', label: 'So‘nggi 3 oy' },
  { value: 'year', label: 'So‘nggi 12 oy' },
];

const RECENT_LEADS: LeadListParams = { page: 1, limit: 6, sortBy: 'createdAt', sortOrder: 'desc' };
const TOP_DEBTS: DebtListParams = { page: 1, limit: 6, sortBy: 'remaining', sortOrder: 'desc' };

/** Eng so'nggi qo'shilgan leadlar — leadlar ro'yxati API'sidan (xodim ko'ra oladiganlari) */
export function RecentLeadsCard() {
  const query = useQuery({ queryKey: queryKeys.leads.list(RECENT_LEADS), queryFn: () => leadsService.list(RECENT_LEADS) });
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>So‘nggi leadlar</CardTitle>
        <CardLink to="/leads" />
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton height="h-12" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState size="sm" icon={UserPlus} title="Lead yo‘q" description="Yangi murojaatlar shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((lead) => (
              <li key={lead.id}>
                <Link to={`/leads/${lead.id}`} className="block px-5 py-3 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-body font-medium text-fg">{leadFullName(lead)}</p>
                    <StatusBadge kind="lead" status={lead.status} />
                  </div>
                  <p className="mt-0.5 truncate text-caption text-fg-muted">
                    {lead.course?.name ?? 'Kurs tanlanmagan'} · {lead.source.name}
                  </p>
                  <p className="mt-0.5 text-caption text-fg-subtle">{formatRelativeTime(lead.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Eng katta qarzdorlar — qarzdorlik ro'yxati API'sidan */
export function OutstandingDebtsCard() {
  const query = useQuery({ queryKey: queryKeys.debts.list(TOP_DEBTS), queryFn: () => debtsService.list(TOP_DEBTS) });
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Eng katta qarzdorlar</CardTitle>
        <CardLink to="/debts" />
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton height="h-12" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState size="sm" icon={Wallet} title="Qarzdor yo‘q" description="Barcha to‘lovlar o‘z vaqtida" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((debt) => (
              <li key={debt.studentId}>
                <Link to={`/students/${debt.studentId}`} className="block px-5 py-3 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-body font-medium text-fg">
                      {debt.firstName} {debt.lastName}
                    </p>
                    <p className="shrink-0 text-body font-medium text-danger tabular-nums">{formatMoney(debt.remaining)}</p>
                  </div>
                  <p className="mt-0.5 truncate text-caption text-fg-muted">
                    {debt.course.name}
                    {debt.group ? ` · ${debt.group.name}` : ''}
                  </p>
                  {debt.schedule && debt.schedule.overdueDays > 0 && (
                    <p className="mt-0.5 text-caption text-warning">{formatNumber(debt.schedule.overdueDays)} kun kechikkan</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Bugungi va kechikkan follow-uplar */
export function TodayTasksCard() {
  const query = useQuery({ queryKey: queryKeys.dashboard.followUps, queryFn: dashboardService.followUps });
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Bugungi vazifalar</CardTitle>
        <CardLink to="/follow-ups" />
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton height="h-12" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState size="sm" icon={CalendarClock} title="Bugunga vazifa yo‘q" description="Kechikkan follow-up ham yo‘q" />
        ) : (
          // Ro'yxat uzun bo'lsa karta ichida aylanadi — yonidagi grafik kartasi cho'zilib ketmaydi
          <ul className="max-h-[22.5rem] divide-y divide-border overflow-y-auto">
            {query.data.map((item) => (
              <li key={item.id}>
                <Link to={`/leads/${item.lead.id}`} className="block px-5 py-3 outline-none transition-colors hover:bg-surface-muted focus-visible:bg-surface-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-body font-medium text-fg">{leadFullName(item.lead)}</p>
                    {item.overdue && <Badge tone="danger">Kechikkan</Badge>}
                  </div>
                  <p className="mt-0.5 truncate text-caption text-fg-muted">{item.title}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-caption text-fg-subtle">
                    <span>{formatDateTime(item.dueAt)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" aria-hidden />
                      {formatPhone(item.lead.phone)}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Lead bosqichlari bo'yicha taqsimot */
export function SalesFunnelCard() {
  const query = useQuery({ queryKey: queryKeys.dashboard.funnel, queryFn: dashboardService.funnel });
  const max = Math.max(1, ...(query.data ?? []).map((stage) => stage.count));
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Sotuv voronkasi</CardTitle>
        <CardLink to="/leads">Leadlar</CardLink>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <ListSkeleton rows={4} height="h-8" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="space-y-3">
            {query.data.map((stage) => (
              <li key={stage.status}>
                <div className="mb-1 flex items-center justify-between gap-2 text-caption">
                  <span className="text-fg">{LEAD_STATUS_LABELS[stage.status]}</span>
                  <span className="text-fg-muted tabular-nums">
                    {formatNumber(stage.count)} · {stage.percent}%
                  </span>
                </div>
                <ProgressBar percent={Math.round((stage.count / max) * 100)} className={stage.status === 'WON' ? 'bg-chart-positive' : stage.status === 'LOST' ? 'bg-chart-neutral' : 'bg-chart-brand'} />
                {stage.avgDaysToReach !== null && <p className="mt-0.5 text-caption text-fg-subtle">o‘rtacha {stage.avgDaysToReach} kunda keladi</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Sotuvchilar reytingi — tushum bo'yicha */
export function ManagersCard() {
  const [period, setPeriod] = useState<ManagerPeriod>('month');
  const query = useQuery({ queryKey: queryKeys.dashboard.managers(period), queryFn: () => dashboardService.managers(period) });
  return (
    <Card className="h-full">
      <CardHeader className="items-center">
        <CardTitle>Managerlar reytingi</CardTitle>
        <Select value={period} onChange={(event) => setPeriod(event.target.value as ManagerPeriod)} aria-label="Managerlar davri" wrapperClassName="w-40" className="h-8">
          {MANAGER_PERIODS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState size="sm" icon={TrendingUp} title="Ma’lumot yo‘q" description="Tanlangan davrda sotuv qayd etilmagan" />
        ) : (
          <ol className="divide-y divide-border">
            {query.data.map((manager, index) => (
              <li key={manager.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-chip text-caption font-semibold tabular-nums',
                    index === 0 ? 'bg-warning-subtle text-warning' : 'bg-surface-muted text-fg-muted',
                  )}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-fg">
                    {manager.firstName} {manager.lastName}
                  </p>
                  <p className="truncate text-caption text-fg-muted">
                    {manager.roleName} · {formatNumber(manager.leads)} lead · {formatNumber(manager.won)} sotuv · {manager.conversionRate}%
                  </p>
                </div>
                <p className="shrink-0 text-body font-semibold text-fg tabular-nums">{formatMoney(manager.revenue)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Qisqa faoliyat lentasi — to‘liqi Faoliyat sahifasida */
export function RecentActivityCard() {
  const query = useQuery({ queryKey: queryKeys.activity.feed({ limit: 8 }), queryFn: () => activityService.feed({ limit: 8 }) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>So‘nggi faoliyat</CardTitle>
        <CardLink to="/activity" />
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState size="sm" icon={History} title="Faoliyat yo‘q" description="Yangi voqealar shu yerda ko‘rinadi" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-fg">{item.title}</p>
                  <p className="truncate text-caption text-fg-muted">
                    {item.description} · {formatRelativeTime(item.occurredAt)}
                  </p>
                </div>
                {item.amount !== null && (
                  <span className={cn('shrink-0 text-body font-medium whitespace-nowrap tabular-nums', item.amount < 0 ? 'text-danger' : 'text-success')}>
                    {item.amount < 0 ? '−' : '+'}
                    {formatMoney(Math.abs(item.amount))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
