import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentIntent } from '@/types/onlinePayment';
import { OnlinePaymentsCard } from './OnlinePaymentsCard';

const base: Omit<PaymentIntent, 'id' | 'provider' | 'status' | 'checkoutUrl'> = {
  externalId: 'x',
  amount: 250_000,
  paymentId: null,
  failureText: null,
  paidAt: null,
  createdAt: '2026-09-27T10:00:00.000Z',
  student: { id: 's1', number: 1, name: 'Ali Valiyev' },
};

const intents: PaymentIntent[] = [
  { ...base, id: 'i1', provider: 'PAYME', status: 'PENDING', checkoutUrl: 'https://checkout.test.paycom.uz/abc' },
  { ...base, id: 'i2', provider: 'CLICK', status: 'PAID', checkoutUrl: null, student: { id: 's2', number: 2, name: 'Vali Aliyev' } },
];

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('@/services/onlinePayment.service', () => ({
  onlinePaymentService: {
    providers: vi.fn(async () => [
      { key: 'PAYME', configured: true, mode: 'test' },
      { key: 'CLICK', configured: true, mode: 'production' },
      { key: 'SANDBOX', configured: false, mode: 'sandbox' },
    ]),
    list: vi.fn(async () => ({ items: intents, meta: { page: 1, limit: 10, total: 2, totalPages: 1 } })),
    refund: vi.fn(async () => ({ data: { ...intents[1], status: 'REFUNDED' }, message: 'To‘lov qaytarildi' })),
  },
}));
const { onlinePaymentService } = await import('@/services/onlinePayment.service');

function renderCard() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OnlinePaymentsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OnlinePaymentsCard (GAP-17)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sinov kassasi yashirilmaydi; kutilayotgan so‘rovda to‘lov havolasi', async () => {
    renderCard();
    expect(await screen.findByText('PAYME — sinov kassasi')).toBeInTheDocument();
    expect(screen.getByText('CLICK — ishlab chiqarish')).toBeInTheDocument();
    const pending = (await screen.findByText('Ali Valiyev')).closest('li')!;
    expect(within(pending).getByText('sinov')).toBeInTheDocument();
    expect(within(pending).getByRole('link', { name: /To‘lov havolasi/ })).toHaveAttribute('href', 'https://checkout.test.paycom.uz/abc');
    expect(within(pending).queryByRole('button', { name: /Qaytarish/ })).toBeNull();
  });

  it('to‘langan Click so‘rovi: tasdiq bilan qaytarish', async () => {
    const user = userEvent.setup();
    renderCard();
    const paid = (await screen.findByText('Vali Aliyev')).closest('li')!;
    expect(within(paid).queryByText('sinov')).toBeNull();
    await user.click(within(paid).getByRole('button', { name: /Qaytarish/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Qaytarish' }));
    await waitFor(() => expect(onlinePaymentService.refund).toHaveBeenCalledWith('i2'));
  });
});
