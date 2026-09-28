import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SystemStatusPage from './SystemStatusPage';

/** TZ 3.1 PHASE 21 — "Fon vazifalari" kartasi: faqat settings.manage; xato muvaffaqiyatdan yangi bo'lsa — qizil */
const permission = { allowed: true };
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => permission.allowed }));
vi.mock('@/services/health.service', () => ({
  healthService: {
    check: vi.fn(async () => ({ status: 'ok', service: 'crm-backend', environment: 'test', database: 'up', uptimeSeconds: 120, timestamp: '2026-09-28T10:00:00.000Z' })),
    jobs: vi.fn(async () => [
      { job: 'notificationDelivery', lastSuccessAt: '2026-09-28T10:00:00.000Z', lastFailureAt: '2026-09-28T09:00:00.000Z' },
      { job: 'codeRun', lastSuccessAt: '2026-09-28T09:00:00.000Z', lastFailureAt: '2026-09-28T10:00:00.000Z' },
      { job: 'orphanUploads', lastSuccessAt: null, lastFailureAt: '2026-09-28T10:00:00.000Z' },
    ]),
  },
}));
const { healthService } = await import('@/services/health.service');

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <SystemStatusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SystemStatusPage — fon vazifalari', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permission.allowed = true;
  });

  it('direktor: har job holati — keyingi muvaffaqiyat xatoni "yopadi"', async () => {
    renderPage();
    const delivery = (await screen.findByText('notificationDelivery')).closest('li')!;
    expect(delivery).toHaveTextContent('ishlayapti');
    expect(screen.getByText('codeRun').closest('li')).toHaveTextContent('xato:');
    const orphan = screen.getByText('orphanUploads').closest('li')!;
    expect(orphan).toHaveTextContent('hali muvaffaqiyatli emas');
    expect(orphan).toHaveTextContent('xato:');
  });

  it('settings.manage yo‘q — karta ko‘rinmaydi va so‘rov yuborilmaydi', async () => {
    permission.allowed = false;
    renderPage();
    expect(await screen.findByText('Ishlayapti')).toBeInTheDocument();
    expect(screen.queryByText('Fon vazifalari')).not.toBeInTheDocument();
    expect(healthService.jobs).not.toHaveBeenCalled();
  });
});
