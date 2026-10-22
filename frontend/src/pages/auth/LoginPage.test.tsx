import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/auth.service', () => ({ authService: { login: vi.fn(), loginTwoFactor: vi.fn() } }));
const setSession = vi.fn();
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector: (state: { setSession: typeof setSession }) => unknown) => selector({ setSession }) }));
const { authService } = await import('@/services/auth.service');
const service = vi.mocked(authService);

const session = { accessToken: 'a', expiresIn: 900, user: { firstName: 'Ali' } } as never;

function open() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/dashboard', element: <p>Bosh sahifa</p> },
    ],
    { initialEntries: ['/login?redirect=/dashboard'] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function submitPassword() {
  await userEvent.type(screen.getByLabelText('Login'), 'owner@test.uz');
  await userEvent.type(screen.getByLabelText('Parol'), 'Password123');
  await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
}

describe('LoginPage — ikki bosqichli kirish', () => {
  beforeEach(() => vi.clearAllMocks());

  it('2FA yoqilmagan — darhol kiradi', async () => {
    service.login.mockResolvedValue(session);
    open();
    await submitPassword();
    expect(await screen.findByText('Bosh sahifa')).toBeInTheDocument();
    expect(setSession).toHaveBeenCalledWith(session);
  });

  it('2FA yoqilgan — kod so‘raladi, kod bilan kiradi; tiklash kodiga o‘tish mumkin', async () => {
    service.login.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'challenge-1', expiresIn: 300 });
    service.loginTwoFactor.mockResolvedValue(session);
    open();
    await submitPassword();
    expect(await screen.findByRole('heading', { name: /Tasdiqlash kodi/ })).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Tiklash kodi bilan/ }));
    expect(screen.getByLabelText('Tiklash kodi')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ilovadagi kod bilan' }));

    await userEvent.type(screen.getByLabelText('Kod'), '12a3456');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    await waitFor(() => expect(service.loginTwoFactor).toHaveBeenCalledWith({ challengeToken: 'challenge-1', code: '123456' }));
    expect(await screen.findByText('Bosh sahifa')).toBeInTheDocument();
  });

  it('tasdiqlash muddati o‘tsa (401) — parol bosqichiga qaytadi va sabab ko‘rsatiladi', async () => {
    service.login.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'challenge-1', expiresIn: 300 });
    service.loginTwoFactor.mockRejectedValue(Object.assign(new Error('Tasdiqlash muddati tugadi. Qaytadan kiring'), { response: { status: 401 } }));
    open();
    await submitPassword();
    await userEvent.type(await screen.findByLabelText('Kod'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Kirish' }));
    expect(await screen.findByRole('heading', { name: 'Tizimga kirish' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
