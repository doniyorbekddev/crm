import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { OrgOverview } from '@/types/org';

/** Tashkilot paneli: ruxsat berilgan bloklar ko'rinadi, null bloklar umuman chiqmaydi */
const OVERVIEW: OrgOverview = {
  date: '2026-11-03',
  period: { year: 2026, month: 11, isCurrent: true },
  attendance: { expected: 10, working: 7, onTime: 6, late: 1, notArrived: 2, absent: 1, excused: 0, review: 0, lateNames: ['Akmal'] },
  team: null,
  tasks: { open: 3, inProgress: 2, review: 1, overdue: 2, doneThisMonth: 9, overdueItems: [{ id: 't1', title: 'Hisobot', assignee: 'Shodiya S', dueAt: '2026-11-02T10:00:00.000Z' }] },
  kpi: null,
  academic: null,
  sales: null,
  marketing: null,
  payments: null,
  payroll: null,
  expenses: { total: 4_000_000, pendingApprovals: 1, overLimit: [{ name: 'Marketing', spent: 1_600_000, limit: 1_000_000 }] },
  complaints: null,
  assets: null,
  approvals: { expenses: 1, discounts: 2, reviews: 0, promotions: 1, candidates: 0 },
  summary: [
    { key: 'tasks_overdue', tone: 'negative', area: 'Vazifalar', text: '2 ta vazifa muddati o‘tgan — mas’ullar bilan gaplashing', metric: { label: 'Muddati o‘tgan vazifalar', value: '2' }, link: '/tasks?scope=all' },
  ],
};
const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));
vi.mock('@/services/org.service', () => ({ orgService: { overview } }));
const { default: OrgOverviewPage } = await import('./OrgOverviewPage');

function renderAt(url = '/org-overview') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <OrgOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Tashkilot paneli', () => {
  it('ruxsatdagi bloklar va ogohlantirishlar; yo‘q bloklar chiqmaydi', async () => {
    overview.mockResolvedValue(OVERVIEW);
    renderAt();
    expect(await screen.findByText('Qaroringizni kutmoqda')).toBeInTheDocument();
    expect(screen.getByText('Kechikkanlar: Akmal')).toBeInTheDocument();
    expect(screen.getByText(/Hisobot — Shodiya S/)).toBeInTheDocument();
    expect(screen.getByText(/Limitdan oshgan: Marketing/)).toBeInTheDocument();
    const approvals = screen.getByText('Qaroringizni kutmoqda').closest('div.rounded-card, div')!.parentElement!;
    expect(within(approvals).getByText('Chegirma')).toBeInTheDocument();
    expect(screen.queryByText('Jamoa')).not.toBeInTheDocument();
    expect(screen.queryByText('Aktivlar')).not.toBeInTheDocument();
    // Boshqaruv xulosasi: fikr, manba ko'rsatkichi va havola
    const insight = screen.getByRole('link', { name: /2 ta vazifa muddati o‘tgan/ });
    expect(insight).toHaveAttribute('href', '/tasks?scope=all');
    expect(insight).toHaveTextContent('Muddati o‘tgan vazifalar: 2');
  });

  it('o‘tgan oy tanlansa: o‘sha oy so‘raladi, "hozirgi holat" izohi chiqadi, shartnoma qoldig‘i yashiriladi', async () => {
    overview.mockResolvedValue({
      ...OVERVIEW,
      period: { year: 2026, month: 10, isCurrent: false },
      payments: { revenue: 9_000_000, totalDebt: null, dueDebt: 1_500_000, dueDebtors: 3, debtSource: 'ESTIMATED' },
    } satisfies OrgOverview);
    renderAt('/org-overview?period=2026-10');

    expect(await screen.findByText('To‘lovlar va qarzdorlik')).toBeInTheDocument();
    expect(overview).toHaveBeenLastCalledWith('2026-10');
    expect(screen.getByText(/Davomat, jamoa, ochiq vazifalar, murojaatlar, aktivlar va tasdiqlar/)).toBeInTheDocument();
    expect(screen.getByText('Qarz (oy oxiri) · 3 ta')).toBeInTheDocument();
    expect(screen.queryByText('Shartnoma qoldig‘i')).not.toBeInTheDocument();
    expect(screen.getByText(/Qarz taxminiy/)).toBeInTheDocument();
    expect(screen.getByText('Tanlangan oy raqamlari o‘zgarmaydi.', { exact: false })).toBeInTheDocument();
  });
});
