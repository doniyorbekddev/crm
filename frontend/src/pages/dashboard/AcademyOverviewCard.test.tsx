import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AcademyOverview, ExecutiveKpi } from '@/types/dashboard';
import { AcademyOverviewCard } from './AcademyOverviewCard';

const overview: AcademyOverview = {
  windowDays: 30,
  parents: { total: 40, withPortal: 25, telegramLinked: 18 },
  courses: { active: 6 },
  groups: { active: 12, planned: 2 },
  attendance: { rate: 87, marked: 900 },
  homework: { open: 9, toGrade: 14, submissionRate: 76 },
  exams: { held: 5, averagePercentage: 71, needsReview: 3 },
  progress: { averageMastery: 64, masteredShare: 38, tracked: 400 },
  risk: { healthy: 80, attention: 10, atRisk: 6, critical: 2 },
  marketing: { leads: 120, won: 30, topSource: { name: 'Instagram', leads: 70 } },
  telegram: { linkedChats: 55, queued: 4, failed: 1 },
  ai: { mode: 'RULES', analyses: 22, awaitingDecision: 5 },
};

vi.mock('@/services/dashboard.service', () => ({ dashboardService: { academy: vi.fn(async () => overview) } }));

const kpi = { totalStudents: 130, activeStudents: 110, totalTeachers: 9, monthRevenue: 50_000_000, totalDebt: 7_000_000, salesConversion: 25 } as ExecutiveKpi;

/** TZ 3.0 §76: 15 yo'nalish bitta panelda */
describe('AcademyOverviewCard', () => {
  it('barcha yo‘nalishlar ko‘rinadi, bo‘limga havola bilan; muammoli holat ajratiladi', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AcademyOverviewCard kpi={kpi} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const list = await screen.findByRole('list', { name: 'Yo‘nalishlar' });
    const labels = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('p')!.textContent);
    expect(labels).toEqual([
      'O‘quvchilar',
      'Ota-onalar',
      'O‘qituvchilar',
      'Kurslar',
      'Guruhlar',
      'Davomat',
      'Uy vazifalari',
      'Imtihonlar',
      'Akademik progress',
      'Xavf ostida',
      'Moliya',
      'Sotuv',
      'Marketing',
      'Telegram',
      'AI',
    ]);

    const risk = within(list).getByRole('link', { name: /Xavf ostida/ });
    expect(risk).toHaveAttribute('href', '/teaching');
    expect(risk).toHaveTextContent('8');
    expect(risk).toHaveTextContent('kritik 2');
    expect(within(list).getByRole('link', { name: /Uy vazifalari/ })).toHaveTextContent('baholash kutmoqda 14');
    expect(within(list).getByRole('link', { name: /Marketing/ })).toHaveTextContent('eng ko‘p: Instagram (70)');
    expect(within(list).getByRole('link', { name: /^AI/ })).toHaveTextContent('qoidalar rejimi · qaror kutmoqda 5');
    // Telegram uchun alohida xodim sahifasi yo'q — havolasiz
    expect(within(list).queryByRole('link', { name: /^Telegram/ })).not.toBeInTheDocument();
    expect(screen.getByText('oxirgi 30 kun')).toBeInTheDocument();
  });
});
