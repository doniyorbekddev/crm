import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TwoFactorCard } from './TwoFactorCard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/auth.service', () => ({
  authService: { twoFactorStatus: vi.fn(), twoFactorSetup: vi.fn(), twoFactorEnable: vi.fn(), twoFactorDisable: vi.fn(), twoFactorRecoveryCodes: vi.fn() },
}));
const { authService } = await import('@/services/auth.service');
const service = vi.mocked(authService);

const open = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TwoFactorCard />
    </QueryClientProvider>,
  );

describe('TwoFactorCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('yoqish: parol → QR va kalit → kod → tiklash kodlari bir marta ko‘rsatiladi', async () => {
    service.twoFactorStatus.mockResolvedValue({ enabled: false, enabledAt: null, recoveryCodesLeft: 0 });
    service.twoFactorSetup.mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/CRM:a%40b.uz?secret=JBSWY3DPEHPK3PXP' });
    service.twoFactorEnable.mockResolvedValue({ data: { recoveryCodes: ['ABCD-EFGH', 'JKLM-NPQR'] }, message: 'Yoqildi' });
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Yoqish' }));
    await userEvent.type(screen.getByLabelText('Joriy parol'), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: 'Davom etish' }));
    expect(await screen.findByRole('img', { name: 'QR kod' })).toBeInTheDocument();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeInTheDocument();
    expect(service.twoFactorSetup).toHaveBeenCalledWith('Password123');

    const submit = screen.getByRole('button', { name: 'Tasdiqlash va yoqish' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Ilovadagi kod'), '123456');
    await userEvent.click(submit);
    await waitFor(() => expect(service.twoFactorEnable).toHaveBeenCalledWith('123456'));
    expect(await screen.findByRole('list', { name: 'Tiklash kodlari' })).toHaveTextContent('ABCD-EFGH');
  });

  it('yoqilgan: o‘chirish parol va kod bilan', async () => {
    service.twoFactorStatus.mockResolvedValue({ enabled: true, enabledAt: '2026-10-21T10:00:00.000Z', recoveryCodesLeft: 9 });
    service.twoFactorDisable.mockResolvedValue('O‘chirildi');
    open();
    expect(await screen.findByText(/Tiklash kodlari qoldi: 9/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'O‘chirish' }));
    await userEvent.type(screen.getByLabelText('Joriy parol'), 'Password123');
    await userEvent.type(screen.getByLabelText('Ilovadagi kod yoki tiklash kodi'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'O‘chirish' }));
    await waitFor(() => expect(service.twoFactorDisable).toHaveBeenCalledWith({ password: 'Password123', code: '654321' }));
  });
});
