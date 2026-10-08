import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '@/types/alert';
import { AlertAssignModal } from './AlertAssignModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/alerts.service', () => ({
  alertsService: {
    assignees: vi.fn().mockResolvedValue([
      { id: 'u1', firstName: 'Aziz', lastName: 'Admin', role: 'Admin' },
      { id: 'u2', firstName: 'Dilnoza', lastName: 'Direktor', role: 'Direktor (Owner)' },
    ]),
    assign: vi.fn().mockResolvedValue({ data: {}, message: 'Mas’ul belgilandi' }),
  },
}));
const { alertsService } = await import('@/services/alerts.service');

const alert = { id: 'a1', title: 'Qarzdorlik oshdi', assignee: { id: 'u1', firstName: 'Aziz', lastName: 'Admin' } } as Alert;

function open(onDone = vi.fn(), onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AlertAssignModal alert={alert} onClose={onClose} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone, onClose };
}

describe('AlertAssignModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('joriy mas’ul tanlangan; o‘zgarmaguncha saqlab bo‘lmaydi; boshqasi tanlansa yuboriladi', async () => {
    const user = userEvent.setup();
    const { onDone, onClose } = open();
    const select = await screen.findByLabelText('Mas’ul');
    await waitFor(() => expect(select).toHaveValue('u1'));
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();

    await user.selectOptions(select, 'u2');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(alertsService.assign).toHaveBeenCalledWith('a1', 'u2'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('"Mas’ul yo‘q" tanlansa — `null` yuboriladi', async () => {
    const user = userEvent.setup();
    open();
    const select = await screen.findByLabelText('Mas’ul');
    await waitFor(() => expect(select).toHaveValue('u1'));
    await user.selectOptions(select, '');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(alertsService.assign).toHaveBeenCalledWith('a1', null));
  });
});
