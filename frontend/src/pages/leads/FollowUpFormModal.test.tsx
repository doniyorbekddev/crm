import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FollowUpFormModal } from './FollowUpFormModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => false }));
vi.mock('@/services/lookups.service', () => ({ lookupsService: { leadForm: vi.fn() } }));
vi.mock('@/services/followUps.service', () => ({
  followUpsService: { create: vi.fn(async () => ({ data: {}, message: 'Follow-up qo‘shildi' })), update: vi.fn() },
}));
const { followUpsService } = await import('@/services/followUps.service');

/** TZ 3.1 GAP-09 — follow-up muhimligi web formada ham */
describe('FollowUpFormModal', () => {
  it('muhimlik standart "O‘rta", tanlangani yuboriladi', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FollowUpFormModal leadId="lead-1" onClose={() => {}} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText('Muhimlik')).toHaveValue('MEDIUM');
    await user.type(screen.getByLabelText(/Vazifa/), 'Shartnoma bo‘yicha qo‘ng‘iroq');
    await user.type(screen.getByLabelText(/Muddat/), '2099-12-25T15:30');
    await user.selectOptions(screen.getByLabelText('Muhimlik'), 'URGENT');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(vi.mocked(followUpsService.create).mock.calls[0]![0]).toMatchObject({ leadId: 'lead-1', title: 'Shartnoma bo‘yicha qo‘ng‘iroq', priority: 'URGENT' });
  });
});
