import { useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { DateRangePicker, dateRangeParams } from '@/components/DateRangePicker';
import type { DateRangeValue } from '@/components/DateRangePicker';
import { PageHeader } from '@/components/PageHeader';
import { WidgetLayoutPanel } from '@/components/WidgetLayoutPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePreference } from '@/hooks/usePreference';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardService } from '@/services/dashboard.service';
import type { ExecutiveParams } from '@/types/dashboard';
import type { DateRangePreset } from '@/utils/dateRange';
import { formatDate } from '@/utils/format';
import { WIDGET_SPAN_CLASSES, parseWidgetLayout, resolveWidgets } from '@/utils/widgetLayout';
import type { WidgetDefinition } from '@/utils/widgetLayout';
import { AcademyOverviewCard } from './AcademyOverviewCard';
import { AttentionCard, ForecastCard, InsightsCard, PeriodSummaryCard, TodayCard } from './executive/ExecutiveCards';
import { HealthCard } from './executive/HealthCard';
import { ExecutiveKpiGrid } from './executive/kpis';
import { TrendChart } from './executive/TrendChart';

// ---------------------------------------------------------------------
// Davr tanlash
// ---------------------------------------------------------------------

const EXECUTIVE_PRESETS: readonly DateRangePreset[] = [
  'this_month',
  'last_month',
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_quarter',
  'this_year',
  'last_year',
  'custom',
];

/** Shu oy — prognoz bilan joriy oy; o‘tgan oy — to‘liq oy; qolganlari — sana oralig‘i */
function executiveParams(value: DateRangeValue): ExecutiveParams | null {
  if (value.preset === 'this_month') return {};
  if (value.preset === 'last_month') {
    const today = new Date();
    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { year: previous.getFullYear(), month: previous.getMonth() + 1 };
  }
  const range = dateRangeParams(value);
  return range?.from && range.to ? { from: range.from, to: range.to } : null;
}

// ---------------------------------------------------------------------
// Vidjetlar — tartibi va ko‘rinishi xodim profilida saqlanadi
// ---------------------------------------------------------------------

type WidgetKey = 'health' | 'insights' | 'kpis' | 'academy' | 'forecast' | 'attention' | 'today' | 'trend' | 'summary';

const EXECUTIVE_WIDGETS: ReadonlyArray<WidgetDefinition<WidgetKey>> = [
  { key: 'health', label: 'Sog‘lomlik bahosi', span: 'half' },
  { key: 'insights', label: 'Xulosalar', span: 'half' },
  { key: 'kpis', label: 'Asosiy ko‘rsatkichlar', span: 'full' },
  { key: 'academy', label: 'Akademiya holati', span: 'full' },
  { key: 'forecast', label: 'Oy oxiri prognozi', span: 'full' },
  { key: 'attention', label: 'Diqqat talab qiladi', span: 'full' },
  { key: 'today', label: 'Bugun', span: 'third' },
  { key: 'trend', label: 'Dinamika grafigi', span: 'twoThirds' },
  { key: 'summary', label: 'Davr yakunlari', span: 'full' },
];

/** Avval vidjetlar brauzerda saqlanardi — bir marta profilga ko‘chiriladi */
const LEGACY_STORAGE_KEY = 'executive.hiddenWidgets';

function readLegacyHidden(): string[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Sahifa
// ---------------------------------------------------------------------

export default function ExecutivePage() {
  const [range, setRange] = useState<DateRangeValue>({ preset: 'this_month', custom: { from: '', to: '' } });
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const { value: storedLayout, loaded: layoutLoaded, save: saveLayout } = usePreference('executive.layout', parseWidgetLayout);

  // Brauzerda saqlangan eski tanlov profilga bir marta ko‘chiriladi
  useEffect(() => {
    if (!layoutLoaded || storedLayout) return;
    const legacy = readLegacyHidden();
    if (legacy.length === 0) return;
    saveLayout({ order: EXECUTIVE_WIDGETS.map((widget) => widget.key), hidden: legacy });
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Brauzer xotirasiga kirib bo‘lmasa ham sozlama profilda saqlandi
    }
  }, [layoutLoaded, storedLayout, saveLayout]);

  const params = executiveParams(range);
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.executivePeriod(params ?? {}),
    queryFn: () => dashboardService.executive(params ?? {}),
    enabled: params !== null,
    placeholderData: (previous) => previous,
  });

  const widgets = resolveWidgets(EXECUTIVE_WIDGETS, storedLayout);
  const data = summaryQuery.data;

  const header = (
    <PageHeader
      title="Direktor paneli"
      description={data ? `${data.period.label} · ${formatDate(data.today.date)} holatiga ko‘ra` : 'Butun markaz holati bitta sahifada'}
      documentTitle="Direktor paneli"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} presets={EXECUTIVE_PRESETS} />
          <Button variant="secondary" leftIcon={<LayoutGrid className="size-4" aria-hidden />} aria-expanded={widgetsOpen} onClick={() => setWidgetsOpen((open) => !open)}>
            Vidjetlar
          </Button>
        </div>
      }
    />
  );

  const widgetPanel = widgetsOpen && (
    <WidgetLayoutPanel
      widgets={widgets}
      onChange={(layout) => saveLayout(layout)}
      onReset={() => saveLayout({ order: EXECUTIVE_WIDGETS.map((widget) => widget.key), hidden: [] })}
    />
  );

  if (params === null) {
    return (
      <>
        {header}
        {widgetPanel}
        <Card className="p-8 text-center text-body text-fg-muted">Oraliqning boshlanish va tugash sanalarini tanlang</Card>
      </>
    );
  }

  if (summaryQuery.isError) {
    return (
      <>
        {header}
        <ErrorState error={summaryQuery.error} retrying={summaryQuery.isFetching} onRetry={() => void summaryQuery.refetch()} />
      </>
    );
  }

  if (!data) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Yuklanmoqda">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-card" />
          ))}
        </div>
      </>
    );
  }

  const content: Record<WidgetKey, ReactNode> = {
    health: <HealthCard health={data.health} />,
    insights: <InsightsCard data={data} />,
    kpis: <ExecutiveKpiGrid data={data} />,
    academy: <AcademyOverviewCard kpi={data.kpi} />,
    forecast: data.forecast ? <ForecastCard forecast={data.forecast} /> : null,
    attention: data.attention.length > 0 ? <AttentionCard items={data.attention} /> : null,
    today: <TodayCard today={data.today} />,
    trend: <TrendChart trend={data.trend} />,
    summary: <PeriodSummaryCard data={data} />,
  };

  return (
    <>
      {header}
      {widgetPanel}

      <div className={cn('grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-6', summaryQuery.isFetching && 'opacity-70')}>
        {widgets
          .filter((widget) => widget.visible && content[widget.key] !== null)
          .map((widget) => (
            <div key={widget.key} className={cn('min-w-0', WIDGET_SPAN_CLASSES[widget.span])}>
              {content[widget.key]}
            </div>
          ))}
      </div>
    </>
  );
}
