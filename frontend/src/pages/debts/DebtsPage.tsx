import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Tab, TabList, Tabs } from '@/components/ui/Tabs';
import { ContractBalanceView } from './ContractBalanceView';
import { MonthlyDebtorsView } from './MonthlyDebtorsView';
import { OutstandingDebtsView } from './OutstandingDebtsView';

const VIEWS = {
  outstanding: { label: 'Muddati kelgan qarzlar', description: 'Barcha oylardan qolgan, to‘lov muddati kelgan qarzlar' },
  monthly: { label: 'Oy bo‘yicha', description: 'Tanlangan oy majburiyatlari: hozirgi va oy oxiridagi holat' },
  contract: { label: 'Shartnoma balansi', description: 'Butun shartnoma bo‘yicha qolgan summa (kelgusi oylar ham)' },
} as const;

type DebtView = keyof typeof VIEWS;

const isView = (value: string | null): value is DebtView => value !== null && value in VIEWS;

/**
 * Qarzdorlik: qarz — muddati kelgan, to'lanmagan oy majburiyatlari (qaror 1). Shartnomaning qolgan qismi alohida
 * ko'rinishda. Tanlangan ko'rinish va oy URL da (`?view=`, `?period=`) saqlanadi.
 */
export default function DebtsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  // "To'lov xulosasi"dan kurs bo'yicha ochilganda (?courseId=) — avvalgidek shartnoma balansi
  const view: DebtView = isView(raw) ? raw : params.has('courseId') ? 'contract' : 'outstanding';

  return (
    <>
      <PageHeader title="Qarzdorlik" description={VIEWS[view].description} />
      <Tabs
        value={view}
        onValueChange={(next) =>
          setParams(
            (previous) => {
              const updated = new URLSearchParams(previous);
              updated.set('view', next);
              return updated;
            },
            { replace: true },
          )
        }
        variant="pill"
        panels={false}
      >
        <TabList label="Qarzdorlik ko‘rinishi" className="mb-4">
          {(Object.keys(VIEWS) as DebtView[]).map((key) => (
            <Tab key={key} value={key}>
              {VIEWS[key].label}
            </Tab>
          ))}
        </TabList>
      </Tabs>
      {view === 'outstanding' && <OutstandingDebtsView />}
      {view === 'monthly' && <MonthlyDebtorsView />}
      {view === 'contract' && <ContractBalanceView />}
    </>
  );
}
