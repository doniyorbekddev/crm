import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/auth';
import type { DashboardSummary } from '@/types/dashboard';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { DashboardKpis } from './DashboardKpis';
import DashboardPage from './DashboardPage';
import { changeTrend } from './executive/kpis';

/** Dizayn PHASE 3 — Dashboard: ko'rsatkichlar guruhlari, ruxsatga bog'liq vidjetlar, o'zgarish belgisi */

const SUMMARY: DashboardSummary = {
  date: '05.10.2026',
  teaching: null,
  leads: { todayNew: 4, monthNew: 31, open: 12, monthWon: 9, monthLost: 3, conversionRate: 75 },
  tasks: { todayFollowUps: 5, overdueFollowUps: 2, todayCalls: 7 },
  finance: { todayRevenue: 1_500_000, monthRevenue: 24_000_000, prevMonthRevenue: 30_000_000, monthGrowth: -20 },
  debts: { totalRemaining: 8_400_000, debtors: 6 },
  money: null,
  students: { active: 120, monthNew: 8, frozen: 2 },
};

// jsdom'da o'lcham yo'q — grafik konteyneri chizilmaydi (grafik mazmuni bu testning mavzusi emas)
vi.mock('recharts', async (original) => ({ ...(await original<Record<string, unknown>>()), ResponsiveContainer: () => null }));
vi.mock('@/hooks/usePreference', () => ({ usePreference: () => ({ value: null, loaded: true, save: vi.fn() }) }));
vi.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    summary: vi.fn(async () => SUMMARY),
    charts: vi.fn(async () => []),
    funnel: vi.fn(async () => [{ status: 'NEW', count: 4, percent: 100, avgDaysToReach: null }]),
    followUps: vi.fn(async () => []),
    managers: vi.fn(async () => []),
  },
}));
vi.mock('@/services/activity.service', () => ({ activityService: { feed: vi.fn(async () => ({ items: [] })) } }));
vi.mock('@/services/students.service', () => ({ studentsService: { atRisk: vi.fn(async () => []) } }));
const { dashboardService } = await import('@/services/dashboard.service');
const { activityService } = await import('@/services/activity.service');
const { studentsService } = await import('@/services/students.service');

function setUser(permissions: string[]) {
  const user: AuthUser = {
    id: 'u1',
    email: 'a@b.uz',
    firstName: 'Sherzod',
    lastName: 'A',
    phone: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: { id: 'r', key: 'MANAGER', name: 'Menejer' },
    permissions,
    mustChangePassword: false,
  };
  useAuthStore.setState({ user });
}

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DashboardKpis', () => {
  it('faqat backend qaytargan bloklar chiqadi, yo‘nalish bo‘yicha guruhlangan; har karta o‘z bo‘limiga havola', () => {
    wrap(<DashboardKpis summary={SUMMARY} />);
    expect(screen.queryByRole('region', { name: 'O‘qitish' })).not.toBeInTheDocument();

    const sales = screen.getByRole('region', { name: 'Sotuv' });
    expect(within(sales).getByRole('link', { name: /Bugungi yangi leadlar/ })).toHaveAttribute('href', '/leads');
    expect(within(sales).getByText('75%')).toBeInTheDocument();
    const overdue = within(sales).getByRole('link', { name: /Kechikkan follow-up/ });
    expect(overdue).toHaveTextContent('2');
    expect(overdue).toHaveTextContent('Darhol bog‘laning');

    const finance = screen.getByRole('region', { name: 'Moliya' });
    const revenue = within(finance).getByRole('link', { name: /Bugungi tushum/ });
    expect(revenue).toHaveAttribute('href', '/payments');
    // Oylik o'sish manfiy — qizil, pastga
    expect(within(revenue).getByText('20%')).toHaveClass('text-danger');
    expect(within(finance).getByRole('link', { name: /Umumiy qarzdorlik/ })).toHaveTextContent('6 ta qarzdor');
    // Moliya ruxsati yo'q (money: null) — foyda va kassa kartalari yo'q
    expect(within(finance).queryByText('Oylik sof foyda')).not.toBeInTheDocument();

    expect(within(screen.getByRole('region', { name: 'O‘quvchilar' })).getByText('120')).toBeInTheDocument();
  });
});

describe('DashboardPage', () => {
  it('ruxsatsiz vidjet chizilmaydi va uning so‘rovi yuborilmaydi', async () => {
    setUser([PERMISSIONS.LEAD_VIEW]);
    wrap(<DashboardPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Salom, Sherzod!' })).toBeInTheDocument();
    expect(await screen.findByText('Bugungi holat · 05.10.2026')).toBeInTheDocument();
    expect(await screen.findByText('Sotuv voronkasi')).toBeInTheDocument();
    expect(dashboardService.funnel).toHaveBeenCalled();

    expect(screen.queryByText('Bugungi vazifalar')).not.toBeInTheDocument();
    expect(screen.queryByText('Managerlar reytingi')).not.toBeInTheDocument();
    expect(screen.queryByText('So‘nggi faoliyat')).not.toBeInTheDocument();
    expect(dashboardService.followUps).not.toHaveBeenCalled();
    expect(dashboardService.managers).not.toHaveBeenCalled();
    expect(activityService.feed).not.toHaveBeenCalled();
    expect(studentsService.atRisk).not.toHaveBeenCalled();
  });

  it('rahbar: barcha vidjetlar; bo‘sh ro‘yxatlar bo‘sh holat bilan', async () => {
    setUser([PERMISSIONS.LEAD_VIEW, PERMISSIONS.FOLLOWUP_VIEW, PERMISSIONS.REPORT_VIEW, PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.STUDENT_VIEW]);
    wrap(<DashboardPage />);
    expect(await screen.findByText('Bugunga vazifa yo‘q')).toBeInTheDocument();
    expect(await screen.findByText('Xavf ostida o‘quvchi yo‘q')).toBeInTheDocument();
    expect(await screen.findByText('Faoliyat yo‘q')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Davr' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Managerlar davri' })).toBeInTheDocument();
  });
});

describe('changeTrend — oldingi davr bilan solishtirish', () => {
  it('o‘sish/kamayish, foiz punkti, "kamayishi yaxshi" ko‘rsatkichlar', () => {
    expect(changeTrend(12)).toEqual({ trend: { label: '+12%', direction: 'up', positive: true }, note: null });
    expect(changeTrend(-5, { points: true })).toEqual({ trend: { label: '−5 p.', direction: 'down', positive: true }, note: null });
    // Xarajat o'sdi — yomon
    expect(changeTrend(8, { inverse: true }).trend).toEqual({ label: '+8%', direction: 'up', positive: false });
  });

  it('o‘zgarmagan va solishtirib bo‘lmaydigan holat', () => {
    expect(changeTrend(0)).toEqual({ trend: { label: 'o‘zgarmadi', direction: 'flat' }, note: null });
    expect(changeTrend(null)).toEqual({ trend: null, note: 'solishtirish yo‘q' });
  });
});
