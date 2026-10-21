import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmsSettings } from '@/types/settings';
import { SmsSettingsCard } from './SmsSettingsCard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/smsSettings.service', () => ({ smsSettingsService: { get: vi.fn(), save: vi.fn(), balance: vi.fn(), test: vi.fn() } }));
const { smsSettingsService } = await import('@/services/smsSettings.service');
const service = vi.mocked(smsSettingsService);

function settings(over: Partial<SmsSettings> = {}): SmsSettings {
  return {
    enabled: false,
    types: ['CHILD_ABSENT'],
    recipients: 'PARENTS',
    dailyLimit: 200,
    configured: true,
    sender: '4546',
    availableTypes: [
      { type: 'CHILD_ABSENT', label: 'Darsga kelmadi', example: 'Ali Valiyev - FE-1 guruhidagi darsga kelmadi.' },
      { type: 'DEBT_REMINDER', label: 'Muddati o‘tgan to‘lov', example: 'Ali Valiyev: 450 000 so\'m to\'lov muddati o\'tgan.' },
    ],
    today: { sent: 3, failed: 1, skipped: 0, pending: 0 },
    updatedAt: null,
    ...over,
  };
}

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SmsSettingsCard />
    </QueryClientProvider>,
  );

describe('SmsSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.balance.mockResolvedValue(15000);
  });

  it('Eskiz sozlanmagan — yoqish formasi yo‘q, nima qilish kerakligi aytiladi', async () => {
    service.get.mockResolvedValue(settings({ configured: false }));
    open();
    expect(await screen.findByText('Eskiz ulanmagan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument();
    expect(service.balance).not.toHaveBeenCalled();
  });

  it('yoqib, tur qo‘shib saqlaydi; holat va balans ko‘rinadi', async () => {
    service.get.mockResolvedValue(settings());
    service.save.mockResolvedValue({ data: settings({ enabled: true }), message: 'SMS sozlamalari saqlandi' });
    open();
    expect(await screen.findByText('Bugun yuborildi: 3')).toBeInTheDocument();
    expect(await screen.findByText(/Balans: 15/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('SMS zaxira kanali yoqilgan'));
    await userEvent.click(screen.getByLabelText('Muddati o‘tgan to‘lov'));
    await userEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(service.save).toHaveBeenCalledWith({ enabled: true, types: ['CHILD_ABSENT', 'DEBT_REMINDER'], recipients: 'PARENTS', dailyLimit: 200 }));
  });

  it('noto‘g‘ri limit — saqlab bo‘lmaydi; sinov SMS raqam va matn bilan', async () => {
    service.get.mockResolvedValue(settings({ enabled: true }));
    service.test.mockResolvedValue({ data: { providerMessageId: '1' }, message: 'Sinov SMS yuborildi' });
    open();
    const limit = await screen.findByLabelText(/Kunlik limit/);
    await userEvent.clear(limit);
    await userEvent.type(limit, '0');
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Sinov telefon raqami'), '+998901112233');
    await userEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    await waitFor(() => expect(service.test).toHaveBeenCalledWith('+998901112233', 'Bu Eskiz dan test'));
  });
});
