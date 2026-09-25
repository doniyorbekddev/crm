import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AutomationBuilderModal } from './AutomationBuilderModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/courses.service', () => ({ coursesService: { list: vi.fn().mockResolvedValue({ items: [{ id: 'c1', name: 'Frontend' }], meta: {} }) } }));
vi.mock('@/services/automation.service', () => ({
  automationService: {
    test: vi.fn().mockResolvedValue({ matched: 2, sample: [{ name: 'Ali Test', group: 'F-1', detail: 'vazifa topshirish 40% (2/5)' }] }),
    create: vi.fn().mockResolvedValue({ data: {}, message: 'Qoida yaratildi' }),
    updateCustom: vi.fn(),
  },
}));
const { automationService } = await import('@/services/automation.service');

/** Quruvchi: trigger → shart → amallar → kanal → jadval; sinov hech narsa yubormaydi */
describe('AutomationBuilderModal', () => {
  it('trigger va shart tanlanadi, sinov natijasi ko‘rinadi, to‘g‘ri payload bilan saqlanadi', async () => {
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AutomationBuilderModal onClose={() => {}} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Nomi/), 'Vazifa past');
    await user.selectOptions(screen.getByLabelText('Qachon (trigger)'), 'HOMEWORK_COMPLETION_LOW');
    expect(screen.getByLabelText('Chegara (%)')).toHaveValue('60');
    await user.clear(screen.getByLabelText('Chegara (%)'));
    await user.type(screen.getByLabelText('Chegara (%)'), '50');
    await user.selectOptions(await screen.findByLabelText('Kurs (ixtiyoriy)'), 'c1');

    await user.click(screen.getByRole('button', { name: 'Sinab ko‘rish' }));
    expect(await screen.findByText('Hozir 2 ta holat mos keladi')).toBeInTheDocument();
    expect(automationService.test).toHaveBeenCalledWith({ trigger: 'HOMEWORK_COMPLETION_LOW', conditions: { threshold: 50, days: 30, courseId: 'c1' } });

    await user.click(screen.getByLabelText('Ota-onaga'));
    await user.selectOptions(screen.getByLabelText('Kanal'), 'TELEGRAM');
    await user.click(screen.getByLabelText('Ish yaratish'));
    await user.click(screen.getByLabelText(/Quiz tavsiya qilish/));
    await user.selectOptions(screen.getByLabelText('Qanchalik tez-tez'), 'WEEKLY');
    await user.selectOptions(screen.getByLabelText('Kun'), '5');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() =>
      expect(automationService.create).toHaveBeenCalledWith({
        name: 'Vazifa past',
        trigger: 'HOMEWORK_COMPLETION_LOW',
        conditions: { threshold: 50, days: 30, courseId: 'c1' },
        actions: [
          { type: 'NOTIFY', audience: 'TEACHER', channel: 'TELEGRAM' },
          { type: 'NOTIFY', audience: 'PARENT', channel: 'TELEGRAM' },
          { type: 'CREATE_TASK', assignee: 'TEACHER', dueDays: 2 },
          { type: 'RECOMMEND_QUIZ' },
        ],
        schedule: 'WEEKLY',
        scheduleHour: 9,
        scheduleWeekday: 5,
        isActive: true,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
