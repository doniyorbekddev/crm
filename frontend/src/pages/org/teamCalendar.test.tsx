import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { currentReportingPeriod, periodKey, shiftPeriod } from '@/hooks/useReportingPeriod';
import type { CalendarMonth } from '@/types/org';

/** Umumiy kalendar: oy ro'yxati, belgilar, oy almashtirish */
const calendar = vi.fn(
  async (month: string): Promise<CalendarMonth> => ({
    month,
    from: `${month}-01`,
    to: `${month}-28`,
    canSeeReasons: true,
    items: [
      { id: 'h1', kind: 'HOLIDAY', title: 'Mustaqillik bayrami', person: null, startDate: `${month}-18`, endDate: `${month}-18`, detail: 'Bayram', reason: null },
      { id: 'l1', kind: 'LEAVE', title: 'Guli G — Kasallik ta’tili', person: { id: 'g', name: 'Guli G' }, startDate: `${month}-02`, endDate: `${month}-04`, detail: 'Kasallik ta’tili', reason: 'Ma’lumotnoma' },
    ],
  }),
);
vi.mock('@/services/org.service', () => ({ orgService: { calendar: (month: string) => calendar(month) } }));
const { default: TeamCalendarPage } = await import('./TeamCalendarPage');

describe('Umumiy kalendar', () => {
  it('joriy oy yozuvlari va sabab ko‘rinadi; keyingi oyga o‘tadi', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <TeamCalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const current = periodKey(currentReportingPeriod());
    expect(await screen.findByText('Guli G — Kasallik ta’tili')).toBeInTheDocument();
    expect(screen.getByText('Ma’lumotnoma')).toBeInTheDocument();
    expect(screen.getAllByText('Mustaqillik bayrami').length).toBeGreaterThan(0);
    expect(calendar).toHaveBeenCalledWith(current);

    await user.click(screen.getByRole('button', { name: 'Keyingi oy' }));
    expect(calendar).toHaveBeenLastCalledWith(periodKey(shiftPeriod(currentReportingPeriod(), 1)));
  });
});
