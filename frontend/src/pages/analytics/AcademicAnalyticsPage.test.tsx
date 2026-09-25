import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AcademicAnalytics } from '@/types/academicAnalytics';
import AcademicAnalyticsPage from './AcademicAnalyticsPage';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 400, height: 200 }}>{children}</div> };
});
vi.mock('@/lib/csv', () => ({ toCsv: vi.fn(() => 'csv'), downloadCsv: vi.fn() }));

const base = { students: 0, attendanceRate: null, homeworkRate: null, averageScore: null, examAverage: null, passRate: null, mastery: null, progress: null, retention: null, atRisk: null, feedback: null };

function data(dimension: AcademicAnalytics['dimension']): AcademicAnalytics {
  return {
    dimension,
    from: '2026-08-28',
    to: '2026-09-26',
    rows:
      dimension === 'course'
        ? [{ ...base, key: 'c1', label: 'Frontend', sublabel: '2 guruh', students: 70, attendanceRate: 89, homeworkRate: 76, examAverage: 74, progress: 63, retention: 95, atRisk: 4, weakTopics: [{ id: 't1', title: 'Async', mastery: 41 }] }]
        : [
            { ...base, key: 'g1', label: 'Front-A', sublabel: 'Frontend', students: 12, attendanceRate: 50, homeworkRate: 55 },
            { ...base, key: 'g2', label: 'Front-B', sublabel: 'Frontend', students: 10, attendanceRate: 95, homeworkRate: 90 },
          ],
    totals: { ...base, students: 70 },
    observations: dimension === 'group' ? ['Front-A: davomat 100% → 50% (pasaydi).'] : [],
  };
}

vi.mock('@/services/academicAnalytics.service', () => ({ academicAnalyticsService: { build: vi.fn(async (params: { dimension: AcademicAnalytics['dimension'] }) => data(params.dimension)) } }));
const { academicAnalyticsService } = await import('@/services/academicAnalytics.service');
const { downloadCsv, toCsv } = await import('@/lib/csv');

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AcademicAnalyticsPage />
    </QueryClientProvider>,
  );
}

describe('AcademicAnalyticsPage', () => {
  it('kurs kesimi: ko‘rsatkichlar va zaif mavzular; guruhlarga o‘tganda kuzatuv va saralash', async () => {
    renderPage();
    const row = await screen.findByRole('row', { name: /Frontend/ });
    expect(within(row).getByText('89%')).toBeInTheDocument();
    expect(within(row).getByText('Zaif mavzular: Async (41%)')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Guruhlar' }));
    await waitFor(() => expect(academicAnalyticsService.build).toHaveBeenCalledWith({ dimension: 'group' }));
    expect(await screen.findByText('Front-A: davomat 100% → 50% (pasaydi).')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Davomat bo‘yicha taqqoslash/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Saralash'), 'attendanceRate');
    const bodyRows = screen.getAllByRole('row').slice(1);
    expect(bodyRows[0]).toHaveTextContent('Front-B');

    await user.click(screen.getByRole('button', { name: 'CSV' }));
    expect(toCsv).toHaveBeenCalledWith(expect.arrayContaining(['Nomi', 'Davomat']), expect.arrayContaining([expect.arrayContaining(['Front-B'])]));
    expect(downloadCsv).toHaveBeenCalledWith('csv', 'akademik-group-2026-08-28_2026-09-26.csv');
  });
});
