import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { WidgetLayoutPanel } from '@/components/WidgetLayoutPanel';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { usePreference } from '@/hooks/usePreference';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import { useAuthStore } from '@/store/auth.store';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { WIDGET_SPAN_CLASSES, parseWidgetLayout, resolveWidgets } from '@/utils/widgetLayout';
import type { WidgetDefinition } from '@/utils/widgetLayout';
import { AtRiskStudents } from './AtRiskStudents';
import { ManagersCard, OutstandingDebtsCard, RecentActivityCard, RecentLeadsCard, SalesFunnelCard, TodayTasksCard } from './DashboardCards';
import { DashboardCharts } from './DashboardCharts';
import { DashboardKpis } from './DashboardKpis';

/** Vidjet kalitlari xodim profilida saqlanadi (`dashboard.layout`) — o'zgartirilmaydi */
type WidgetKey = 'kpis' | 'charts' | 'tasks' | 'funnel' | 'atRisk' | 'managers' | 'recentLeads' | 'debts' | 'activity';

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const canViewReports = usePermission(PERMISSIONS.REPORT_VIEW);
  const canViewLeads = usePermission(PERMISSIONS.LEAD_VIEW);
  const canViewFollowUps = usePermission(PERMISSIONS.FOLLOWUP_VIEW);
  const canViewActivity = usePermission(PERMISSIONS.ANALYTICS_VIEW);
  const canViewStudents = usePermission(PERMISSIONS.STUDENT_VIEW);
  const canViewDebts = usePermission(PERMISSIONS.DEBT_VIEW);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layout = usePreference('dashboard.layout', parseWidgetLayout);

  const summaryQuery = useQuery({ queryKey: queryKeys.dashboard.summary, queryFn: dashboardService.summary });
  const summary = summaryQuery.data;

  const definitions: ReadonlyArray<WidgetDefinition<WidgetKey>> = [
    { key: 'kpis', label: 'Asosiy ko‘rsatkichlar', span: 'full' },
    { key: 'charts', label: 'Grafiklar', span: 'twoThirds' },
    { key: 'tasks', label: 'Bugungi vazifalar', span: 'third', available: canViewFollowUps },
    { key: 'funnel', label: 'Sotuv voronkasi', span: 'third', available: canViewLeads },
    { key: 'atRisk', label: 'Xavf ostidagi o‘quvchilar', span: 'third', available: canViewStudents },
    { key: 'managers', label: 'Managerlar reytingi', span: 'twoThirds', available: canViewReports },
    { key: 'recentLeads', label: 'So‘nggi leadlar', span: 'half', available: canViewLeads },
    { key: 'debts', label: 'Eng katta qarzdorlar', span: 'half', available: canViewDebts },
    { key: 'activity', label: 'So‘nggi faoliyat', span: 'full', available: canViewActivity },
  ];
  const widgets = resolveWidgets(definitions, layout.value);

  const kpis = summaryQuery.isPending ? (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true" aria-label="Yuklanmoqda">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-28 rounded-card" />
      ))}
    </div>
  ) : summaryQuery.isError ? (
    <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />
  ) : (
    <DashboardKpis summary={summaryQuery.data} />
  );

  // Ruxsat bo'lmagan vidjet `resolveWidgets` da tushib qoladi — uning komponenti (va so'rovi) umuman chizilmaydi
  const content: Record<WidgetKey, () => ReactNode> = {
    kpis: () => kpis,
    charts: () => <DashboardCharts showRevenue={Boolean(summary?.finance)} showAcademy={Boolean(summary?.students)} />,
    tasks: () => <TodayTasksCard />,
    funnel: () => <SalesFunnelCard />,
    atRisk: () => <AtRiskStudents />,
    managers: () => <ManagersCard />,
    recentLeads: () => <RecentLeadsCard />,
    debts: () => <OutstandingDebtsCard />,
    activity: () => <RecentActivityCard />,
  };

  return (
    <>
      <PageHeader
        title={`Salom, ${user?.firstName ?? ''}!`}
        documentTitle="Dashboard"
        description={summary ? `Bugungi holat · ${summary.date}` : 'Ko‘rsatkichlar yuklanmoqda'}
        actions={
          <Button variant="secondary" leftIcon={<LayoutGrid className="size-4" aria-hidden />} aria-expanded={layoutOpen} onClick={() => setLayoutOpen((open) => !open)}>
            Vidjetlar
          </Button>
        }
      />

      {layoutOpen && (
        <WidgetLayoutPanel
          widgets={widgets}
          onChange={(next) => layout.save(next)}
          onReset={() => layout.save({ order: definitions.map((definition) => definition.key), hidden: [] })}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        {widgets
          .filter((widget) => widget.visible)
          .map((widget) => (
            <div key={widget.key} className={cn('min-w-0', WIDGET_SPAN_CLASSES[widget.span])}>
              {content[widget.key]()}
            </div>
          ))}
      </div>
    </>
  );
}
