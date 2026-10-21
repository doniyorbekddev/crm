import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceJournal } from '@/types/attendance';
import GroupAttendanceJournalPage from './GroupAttendanceJournalPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/attendance.service', () => ({ attendanceService: { journal: vi.fn() } }));
const { attendanceService } = await import('@/services/attendance.service');
const journalMock = vi.mocked(attendanceService.journal);

const totals = (over: Partial<AttendanceJournal['totals']> = {}) => ({ PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0, marked: 0, rate: null, ...over });
function journal(year = 2026, month = 9): AttendanceJournal {
  return {
    group: { id: 'g1', name: 'FE-1', courseName: 'Frontend', teacher: 'Aziz Karimov' },
    year,
    month,
    today: '2026-09-16',
    days: [
      { date: '2026-09-14', weekday: 'MONDAY', scheduled: true, session: 'HELD', marked: 2, absent: 1 },
      { date: '2026-09-15', weekday: 'TUESDAY', scheduled: false, session: null, marked: 1, absent: 0 },
      { date: '2026-09-16', weekday: 'WEDNESDAY', scheduled: true, session: 'CANCELLED', marked: 0, absent: 0 },
    ],
    students: [
      { id: 's1', code: 'ST-1', name: 'Test Ali', extraMember: false, former: false, cells: { '2026-09-14': 'PRESENT', '2026-09-15': 'EXCUSED' }, totals: totals({ PRESENT: 1, EXCUSED: 1, marked: 2, rate: 50 }) },
      { id: 's2', code: 'ST-2', name: 'Test Sami', extraMember: false, former: true, cells: { '2026-09-14': 'ABSENT' }, totals: totals({ ABSENT: 1, marked: 1, rate: 0 }) },
    ],
    totals: totals({ PRESENT: 1, EXCUSED: 1, ABSENT: 1, marked: 3, rate: 33 }),
  };
}

function open(path = '/attendance/groups/g1/journal') {
  const router = createMemoryRouter([{ path: '/attendance/groups/:groupId/journal', element: <GroupAttendanceJournalPage /> }], { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('GroupAttendanceJournalPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    journalMock.mockImplementation(async (_groupId, month) => (month === '2026-08' ? journal(2026, 8) : journal()));
  });

  it('o‘quvchi × kun jadvali: belgilar, bekor qilingan kun, sobiq a’zo, foiz va kun sarlavhasi kunlik varaqqa havola', async () => {
    open();
    expect(await screen.findByText('Sentabr 2026')).toBeInTheDocument();
    expect(journalMock).toHaveBeenCalledWith('g1', undefined);
    const table = screen.getByRole('table');
    const ali = within(table).getByRole('row', { name: /Test Ali/ });
    expect(within(ali).getByTitle('2026-09-14: Keldi')).toHaveTextContent('+');
    expect(within(ali).getByTitle('2026-09-15: Sababli')).toHaveTextContent('S');
    expect(within(ali).getByLabelText('bekor qilingan')).toBeInTheDocument();
    expect(within(ali).getByText('50%')).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Test Sami/ })).toHaveTextContent('guruhdan chiqqan');
    expect(within(table).getByRole('link', { name: /14/ })).toHaveAttribute('href', '/attendance/groups/g1?date=2026-09-14');
    expect(screen.getByText('Davomat: 33%')).toBeInTheDocument();
  });

  it('oldingi oyga o‘tish URL va so‘rovni yangilaydi', async () => {
    const router = open();
    await screen.findByText('Sentabr 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Oldingi oy' }));
    await waitFor(() => expect(router.state.location.search).toBe('?month=2026-08'));
    expect(await screen.findByText('Avgust 2026')).toBeInTheDocument();
    expect(journalMock).toHaveBeenLastCalledWith('g1', '2026-08');
  });
});
