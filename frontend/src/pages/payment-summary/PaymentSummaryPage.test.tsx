import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentSummary } from '@/types/paymentSummary';
import PaymentSummaryPage from './PaymentSummaryPage';

vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('@/services/paymentSummary.service', () => ({ paymentSummaryService: { get: vi.fn() } }));
const { paymentSummaryService } = await import('@/services/paymentSummary.service');
const getMock = vi.mocked(paymentSummaryService.get);

const base = { activeStudents: 0, debtors: 0, withoutContract: 0, overdue: 0, monthCollected: 0 };
const DATA: PaymentSummary = {
  scope: 'ALL',
  scopeLabel: 'Barcha o‘quvchilar',
  month: { year: 2026, month: 10 },
  generatedAt: '2026-10-22T06:00:00.000Z',
  totals: { ...base, students: 4, activeStudents: 4, debtors: 2, withoutContract: 1, expected: 14_000_000, collected: 8_000_000, remaining: 6_000_000, overdue: 500_000, monthCollected: 8_000_000, collectedPercent: 57.1 },
  courses: [
    { ...base, courseId: 'c1', courseName: 'Frontend', category: 'PROGRAMMING', categoryLabel: 'Dasturlash', courseStatus: 'ACTIVE', students: 2, activeStudents: 2, debtors: 1, expected: 12_000_000, collected: 7_500_000, remaining: 4_500_000, collectedPercent: 62.5 },
    { ...base, courseId: 'c2', courseName: 'Backend', category: 'PROGRAMMING', categoryLabel: 'Dasturlash', courseStatus: 'ACTIVE', students: 1, expected: 0, collected: 0, remaining: 0, collectedPercent: null },
    { ...base, courseId: 'c3', courseName: 'Ingliz tili', category: 'LANGUAGE', categoryLabel: 'Til', courseStatus: 'ACTIVE', students: 2, debtors: 1, withoutContract: 1, expected: 2_000_000, collected: 500_000, remaining: 1_500_000, overdue: 500_000, collectedPercent: 25 },
  ],
};

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <PaymentSummaryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('PaymentSummaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(DATA);
  });

  it('jami kartalar va yo‘nalishlar jadvali; kurs nomi qarzdorlikka havola', async () => {
    open();
    expect(await screen.findByText('Jami yig‘ilishi kerak')).toBeInTheDocument();
    expect(screen.getAllByText('14 000 000 so‘m').length).toBeGreaterThan(0);
    expect(screen.getByText('Yig‘ilish: 57,1%')).toBeInTheDocument();
    expect(screen.getByText('2 ta qarzdor o‘quvchi')).toBeInTheDocument();
    expect(screen.getByText(/1 ta o‘quvchida shartnoma summasi kiritilmagan/)).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: 'Frontend' })).toHaveAttribute('href', '/debts?courseId=c1');
    expect(within(table).getByRole('row', { name: /Ingliz tili/ })).toHaveTextContent('25%');
  });

  it('toifa bo‘yicha yig‘adi; holat filtri so‘rovni o‘zgartiradi', async () => {
    open();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Toifa bo‘yicha' }));
    const programming = within(screen.getByRole('table')).getByRole('row', { name: /Dasturlash/ });
    expect(programming).toHaveTextContent('12 000 000 so‘m');
    expect(programming).toHaveTextContent('62,5%');
    await userEvent.selectOptions(screen.getByLabelText('O‘quvchilar'), 'STUDYING');
    await waitFor(() => expect(getMock).toHaveBeenLastCalledWith('STUDYING'));
  });
});
