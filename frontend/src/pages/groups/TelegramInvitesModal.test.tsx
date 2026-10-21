import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TelegramInvitesModal } from './TelegramInvitesModal';

const open = { deepLink: 'https://t.me/bot?start=abc', linked: false, expiresAt: '2026-11-04T00:00:00.000Z' };
const linked = { deepLink: null, linked: true, expiresAt: null };

vi.mock('@/services/groups.service', () => ({
  groupsService: {
    telegramInvites: vi.fn(async () => ({
      group: { id: 'g1', name: 'FE-1', courseName: 'Frontend' },
      enabled: true,
      generatedAt: '2026-10-21T00:00:00.000Z',
      rows: [
        { student: { id: 's1', name: 'Valiyev Ali', code: 'ST-000001' }, link: open, parents: [{ id: 'p1', name: 'Ota', phone: '+998935550001', link: open }] },
        { student: { id: 's2', name: 'Valiyev Vali', code: 'ST-000002' }, link: linked, parents: [{ id: 'p1', name: 'Ota', phone: '+998935550001', link: open }] },
        { student: { id: 's3', name: 'Karimov Sami', code: 'ST-000003' }, link: linked, parents: [] },
      ],
    })),
  },
}));

describe('Telegram taklifnomalari oynasi', () => {
  it('ulanganlar soni, ota-onasi yo‘qlar va chop etiladigan kartochkalar soni', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TelegramInvitesModal groupId="g1" onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('2 / 3')).toBeInTheDocument(); // o'quvchilar ulangan
    expect(screen.getByText('0 / 1')).toBeInTheDocument(); // bitta ota-ona (aka-uka uchun bitta)
    expect(screen.getByText(/1 ta o‘quvchining ota-onasi profilga kiritilmagan/)).toBeInTheDocument();
    // Sami: o'zi ulangan va ota-onasi yo'q — varaqqa chiqmaydi
    expect(screen.getByRole('button', { name: 'Chop etish (2)' })).toBeEnabled();
  });
});
