import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringHomework } from '@/types/recurringHomework';
import { RecurringHomeworkModal, scheduleLabel } from './RecurringHomeworkModal';

const item: RecurringHomework = {
  id: 'r1',
  group: { id: 'g1', name: 'Frontend A' },
  title: 'JavaScript Practice',
  description: null,
  maxPoints: 100,
  xpReward: 20,
  frequency: 'WEEKDAYS',
  weekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  startDate: '2026-10-01',
  endDate: null,
  publishTime: '08:00',
  deadlineTime: '23:59',
  deadlineOffsetDays: 0,
  isActive: true,
  generated: 4,
  nextOccurrence: '2026-10-06',
  createdAt: '2026-09-27T10:00:00.000Z',
  createdBy: 'Ustoz',
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/homework.service', () => ({
  recurringHomeworkService: {
    list: vi.fn(async () => [item]),
    create: vi.fn(async () => ({ data: item, message: 'Takrorlanuvchi vazifa yaratildi' })),
    setActive: vi.fn(async () => ({ data: { ...item, isActive: false }, message: 'Saqlandi' })),
    remove: vi.fn(async () => 'Jadval o‘chirildi'),
  },
}));
vi.mock('@/services/groups.service', () => ({ groupsService: { list: vi.fn(async () => ({ items: [{ id: 'g1', name: 'Frontend A' }], total: 1 })) } }));
const { recurringHomeworkService } = await import('@/services/homework.service');

function renderModal() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecurringHomeworkModal canManage onClose={() => undefined} />
    </QueryClientProvider>,
  );
}

describe('RecurringHomeworkModal (GAP-18)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('jadval yorlig‘i', () => {
    expect(scheduleLabel({ frequency: 'DAILY', weekdays: [] })).toBe('Har kuni');
    expect(scheduleLabel(item)).toBe('Ish kunlari (Du–Ju)');
    expect(scheduleLabel({ frequency: 'WEEKLY', weekdays: ['SATURDAY'] })).toBe('Har hafta: Sh');
  });

  it('ro‘yxat: berilganlar soni, keyingi e’lon, to‘xtatish', async () => {
    const user = userEvent.setup();
    renderModal();
    const row = (await screen.findByText('JavaScript Practice')).closest('li')!;
    expect(within(row).getByText(/Berildi: 4 ta/)).toBeInTheDocument();
    expect(within(row).getByText(/Ish kunlari/)).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /To‘xtatish/ }));
    await waitFor(() => expect(recurringHomeworkService.setActive).toHaveBeenCalledWith('r1', false));
  });

  it('yangi jadval: noto‘g‘ri muddat — serverga bormaydi; to‘g‘risi — yuboriladi', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(await screen.findByRole('button', { name: 'Yangi jadval' }));
    await user.selectOptions(await screen.findByLabelText(/Guruh/), 'g1');
    await user.type(screen.getByLabelText(/Vazifa/), 'JavaScript Practice');
    await user.clear(screen.getByLabelText(/Muddat vaqti/));
    await user.type(screen.getByLabelText(/Muddat vaqti/), '07:00');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('Muddat e’lon vaqtidan keyin bo‘lsin')).toBeInTheDocument();
    expect(recurringHomeworkService.create).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Muddat vaqti/));
    await user.type(screen.getByLabelText(/Muddat vaqti/), '23:59');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(recurringHomeworkService.create).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'g1', title: 'JavaScript Practice', frequency: 'WEEKDAYS', weekdays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], deadlineTime: '23:59', endDate: null }),
      ),
    );
  });
});
