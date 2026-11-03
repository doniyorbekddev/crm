import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { OrgOverview } from '@/types/org';

/** Tashkilot paneli: ruxsat berilgan bloklar ko'rinadi, null bloklar umuman chiqmaydi */
const OVERVIEW: OrgOverview = {
  date: '2026-11-03',
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
};
vi.mock('@/services/org.service', () => ({ orgService: { overview: vi.fn(async () => OVERVIEW) } }));
const { default: OrgOverviewPage } = await import('./OrgOverviewPage');

describe('Tashkilot paneli', () => {
  it('ruxsatdagi bloklar va ogohlantirishlar; yo‘q bloklar chiqmaydi', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OrgOverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Qaroringizni kutmoqda')).toBeInTheDocument();
    expect(screen.getByText('Kechikkanlar: Akmal')).toBeInTheDocument();
    expect(screen.getByText(/Hisobot — Shodiya S/)).toBeInTheDocument();
    expect(screen.getByText(/Limitdan oshgan: Marketing/)).toBeInTheDocument();
    const approvals = screen.getByText('Qaroringizni kutmoqda').closest('div.rounded-card, div')!.parentElement!;
    expect(within(approvals).getByText('Chegirma')).toBeInTheDocument();
    expect(screen.queryByText('Jamoa')).not.toBeInTheDocument();
    expect(screen.queryByText('Aktivlar')).not.toBeInTheDocument();
  });
});
