import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** ORG · 3-bosqich UI: choraklik baholash, karyera tavsiyasi va "Mening rivojlanishim" */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const granted = new Set<string>();
vi.mock('@/hooks/usePermission', () => ({ usePermission: (key: string) => granted.has(key) }));
vi.mock('@/services/org.service', () => ({
  orgService: {
    reviews: vi.fn().mockResolvedValue([]),
    people: vi.fn().mockResolvedValue([{ id: 'u1', firstName: 'Shodiya', lastName: 'S', roleName: 'Sotuv' }]),
    reviewPrefill: vi.fn().mockResolvedValue({ kpiAverage: 92.5, attendanceRate: 97, position: { key: 'SALES_MANAGER', title: 'Sotuv menejeri' } }),
    saveReview: vi.fn().mockResolvedValue({ data: {}, message: 'Baholash tasdiqqa yuborildi' }),
    careers: vi.fn().mockResolvedValue([
      { employeeId: 'e1', name: 'Shodiya S', position: { key: 'SALES_MANAGER', title: 'Sotuv menejeri' }, next: { key: 'STUDENT_SUCCESS_MANAGER', title: 'O‘quvchilar muvaffaqiyati menejeri', requirements: null, minimumKpiScore: 80, minimumMonths: 6 }, monthsInPosition: 22, kpiAverage: 91, meetsKpi: true, meetsTenure: true, eligible: true, pendingPromotion: false },
    ]),
    promotions: vi.fn().mockResolvedValue([]),
    recommend: vi.fn().mockResolvedValue({ data: {}, message: 'Tavsiya yuborildi' }),
    myGrowth: vi.fn().mockResolvedValue({
      reviews: [],
      awards: [{ id: 'a1', type: 'EMPLOYEE_OF_MONTH', year: 2026, period: 10, title: 'Oktyabr oyi xodimi', reason: 'Qarzdorlik kamaydi', amount: 500_000, salaryPeriodId: 'p1', createdAt: '2026-10-31T00:00:00.000Z', user: { id: 'u1', firstName: 'G', lastName: 'K' }, createdBy: null }],
      career: { employeeId: 'e1', name: 'Guli K', position: { key: 'RECEPTIONIST', title: 'Qabulxona / kassir' }, next: { key: 'OPERATIONS_MANAGER', title: 'Operatsion menejer', requirements: 'Kassa hisobida xatosiz 6 oy', minimumKpiScore: 85, minimumMonths: 12 }, monthsInPosition: 8, kpiAverage: 88, meetsKpi: true, meetsTenure: false, eligible: false, pendingPromotion: false },
    }),
  },
}));
const { orgService } = await import('@/services/org.service');
const { default: PerformancePage } = await import('./PerformancePage');
const { default: MyGrowthPage } = await import('./MyGrowthPage');

function wrap(children: ReactNode, path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ORG · 3-bosqich UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    granted.clear();
  });

  it('baholash: KPI va davomat avtomatik ko‘rinadi; mezonlar bilan tasdiqqa yuboriladi', async () => {
    granted.add('performance.manage');
    const user = userEvent.setup();
    wrap(<PerformancePage />);
    await screen.findByRole('option', { name: /Shodiya S/ });
    await user.selectOptions(screen.getByLabelText('Xodimni baholash'), 'u1');
    await user.click(screen.getByRole('button', { name: 'Baholash' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/KPI o‘rtachasi 92.5% · davomat 97%/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Natija'), '5');
    await user.click(within(dialog).getByRole('button', { name: 'Tasdiqqa yuborish' }));
    await waitFor(() => expect(orgService.saveReview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', submit: true, scores: expect.objectContaining({ results: 5, quality: 3 }) })));
  });

  it('karyera: talab bajarilgan xodim "tayyor"; tavsiya sababi bilan yuboriladi', async () => {
    granted.add('performance.manage');
    const user = userEvent.setup();
    wrap(<PerformancePage />, '/performance?tab=career');
    const row = (await screen.findByText('Shodiya S')).closest('li')!;
    expect(within(row).getByText('Ko‘tarilishga tayyor')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Tavsiya qilish' }));
    await user.type(screen.getByLabelText('Tavsiya sababi'), 'Saqlab qolish eng yuqori');
    await user.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(orgService.recommend).toHaveBeenCalledWith({ employeeId: 'e1', toPositionKey: 'STUDENT_SUCCESS_MANAGER', reason: 'Saqlab qolish eng yuqori' }));
  });

  it('mening rivojlanishim: karyera talablari (bajarilgan / bajarilmagan) va taqdirlashlar', async () => {
    wrap(<MyGrowthPage />);
    expect(await screen.findByText('Operatsion menejer')).toBeInTheDocument();
    expect(screen.getByText(/Lavozimda 8 oy \(kerak: 12\)/).closest('li')!.querySelector('[aria-label="Bajarilmagan"]')).not.toBeNull();
    expect(screen.getByText(/O‘rtacha KPI \(3 oy\): 88%/).closest('li')!.querySelector('[aria-label="Bajarilgan"]')).not.toBeNull();
    expect(screen.getByText('Oktyabr oyi xodimi')).toBeInTheDocument();
  });
});
