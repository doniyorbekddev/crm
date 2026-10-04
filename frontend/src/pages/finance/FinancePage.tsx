import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { BarChart3, Lock, ScrollText, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { DateRangePicker, dateRangeParams } from '@/components/DateRangePicker';
import type { DateRangeValue } from '@/components/DateRangePicker';
import { PageHeader } from '@/components/PageHeader';
import { usePermission } from '@/hooks/usePermission';
import type { FinanceRangeParams } from '@/types/finance';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { BudgetTab } from './BudgetTab';
import { FinancialPeriodsTab } from './FinancialPeriodsTab';
import { FinanceOverview } from './FinanceOverview';
import { ProfitLossTab } from './ProfitLossTab';
import { TransactionsTab } from './TransactionsTab';

type Tab = 'overview' | 'pnl' | 'transactions' | 'budget' | 'periods';

export default function FinancePage() {
  const canViewBudget = usePermission(PERMISSIONS.FINANCE_VIEW);
  const [tab, setTab] = useState<Tab>('overview');
  const [rangeValue, setRangeValue] = useState<DateRangeValue>({ preset: 'this_month', custom: { from: '', to: '' } });
  // Oraliq to'liq tanlanmaguncha server standart davri (joriy oy) ko'rsatiladi
  const range: FinanceRangeParams = dateRangeParams(rangeValue) ?? {};

  const tabs: ReadonlyArray<{ value: Tab; label: string; icon: typeof BarChart3 }> = [
    { value: 'overview', label: 'Panel', icon: BarChart3 },
    ...(canViewBudget ? ([{ value: 'pnl', label: 'Foyda va zarar', icon: TrendingUp }] as const) : []),
    { value: 'transactions', label: 'Moliyaviy daftar', icon: ScrollText },
    ...(canViewBudget ? ([{ value: 'budget', label: 'Budjet', icon: Target }] as const) : []),
    ...(canViewBudget ? ([{ value: 'periods', label: 'Oylarni yopish', icon: Lock }] as const) : []),
  ];

  return (
    <>
      <PageHeader
        title="Moliya"
        description="Tushum, xarajat, sof foyda, kassalar va budjet"
        documentTitle="Moliya paneli"
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} panels={false}>
          <TabList label="Moliya bo‘limlari">
            {tabs.map((item) => (
              <Tab key={item.value} value={item.value} icon={<item.icon className="size-4" aria-hidden />}>
                {item.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>

        {tab !== 'budget' && tab !== 'periods' && (
          <DateRangePicker value={rangeValue} onChange={setRangeValue} className="sm:ml-auto" />
        )}
      </div>

      {tab === 'overview' && <FinanceOverview range={range} />}
      {tab === 'pnl' && <ProfitLossTab range={range} />}
      {tab === 'transactions' && <TransactionsTab range={range} />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'periods' && <FinancialPeriodsTab />}
    </>
  );
}
