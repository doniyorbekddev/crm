import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeFormModal } from './BadgeFormModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/gamification.service', () => ({ gamificationService: { createBadge: vi.fn() } }));
const { gamificationService } = await import('@/services/gamification.service');

function renderModal(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BadgeFormModal onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

describe('BadgeFormModal (GAP-02)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('talab turi chegarani boshqaradi: qo‘lda — chegara yo‘q, davomat — 1–100, toifa avtomatik', async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.getByLabelText(/Chegara/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Talab/), 'MANUAL');
    expect(screen.queryByLabelText(/Chegara/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Toifa/)).toHaveValue('SPECIAL');
    await user.selectOptions(screen.getByLabelText(/Talab/), 'REFERRAL');
    expect(screen.getByLabelText(/Toifa/)).toHaveValue('SOCIAL');
    expect(screen.getByLabelText(/Chegara \(ta do‘st\)/)).toHaveValue('1');
  });

  it('noto‘g‘ri qiymat — serverga yuborilmaydi', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.selectOptions(screen.getByLabelText(/Talab/), 'ATTENDANCE_RATE');
    await user.clear(screen.getByLabelText(/Chegara/));
    await user.type(screen.getByLabelText(/Chegara/), '150');
    await user.click(screen.getByRole('button', { name: 'Yaratish' }));
    expect(screen.getByText('1–100 oralig‘ida butun son')).toBeInTheDocument();
    expect(screen.getByText('Kamida 2 belgi')).toBeInTheDocument();
    expect(gamificationService.createBadge).not.toHaveBeenCalled();
  });

  it('yaratadi (qo‘lda nishonda chegara yuborilmaydi); server dublikat xatosi maydon ostida', async () => {
    const user = userEvent.setup();
    vi.mocked(gamificationService.createBadge)
      .mockRejectedValueOnce(Object.assign(new Error('400'), { isAxiosError: true, response: { status: 400, data: { success: false, message: 'Bunday nomli nishon allaqachon bor', errors: [{ field: 'name', message: 'Boshqa nom tanlang' }] } } }))
      .mockResolvedValueOnce({ data: {} as never, message: 'Nishon yaratildi' });
    const onClose = renderModal();
    await user.type(screen.getByLabelText(/Nomi/), 'Oy faoli');
    await user.type(screen.getByLabelText(/Tavsif/), 'Oy davomida eng faol');
    await user.selectOptions(screen.getByLabelText(/Talab/), 'MANUAL');
    await user.click(screen.getByRole('button', { name: 'Yaratish' }));
    expect(await screen.findByText('Boshqa nom tanlang')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/Nomi/));
    await user.type(screen.getByLabelText(/Nomi/), 'Oy faoli 2');
    await user.click(screen.getByRole('button', { name: 'Yaratish' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(vi.mocked(gamificationService.createBadge).mock.calls[1]![0]).toEqual({
      name: 'Oy faoli 2',
      description: 'Oy davomida eng faol',
      icon: '🏅',
      category: 'SPECIAL',
      rule: 'MANUAL',
      xpReward: 50,
      isActive: true,
    });
  });
});
