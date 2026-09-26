import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BroadcastItem } from '@/types/broadcast';
import BroadcastsPage, { isSafeUrl, validateBroadcast } from './BroadcastsPage';

const history: BroadcastItem[] = [
  {
    id: 'b1',
    audience: 'STUDENTS',
    label: 'Barcha o‘quvchilar',
    recipients: 12,
    message: 'Ertaga dars yo‘q',
    sent: 10,
    delivered: 10,
    failed: 2,
    skipped: 1,
    pending: 0,
    mediaKind: 'photo',
    buttons: [{ text: 'Jadval', url: 'https://example.uz' }],
    createdAt: '2026-09-26T10:00:00.000Z',
    createdBy: 'Sherzod A',
  },
];

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/broadcasts.service', () => ({
  broadcastsService: {
    list: vi.fn(async () => history),
    preview: vi.fn(async () => ({ audience: 'STUDENTS', label: 'Barcha o‘quvchilar', recipients: 42 })),
    send: vi.fn(async () => ({ data: { ...history[0], id: 'b2', recipients: 42, pending: 42 }, message: 'Xabar 42 ta chatga navbatga qo‘yildi' })),
    uploadMedia: vi.fn(),
  },
}));
vi.mock('@/services/groups.service', () => ({ groupsService: { list: vi.fn(async () => ({ items: [{ id: 'g1', name: 'Front-1' }], total: 1 })) } }));
vi.mock('@/services/courses.service', () => ({ coursesService: { list: vi.fn(async () => ({ items: [{ id: 'c1', name: 'Python' }], total: 1 })) } }));
const { broadcastsService } = await import('@/services/broadcasts.service');

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('isSafeUrl / validateBroadcast', () => {
  it('faqat https havola; guruh tanlanmasa va qisqa xabar — xato', () => {
    expect(isSafeUrl('https://example.uz/a')).toBe(true);
    for (const bad of ['http://example.uz', 'javascript:alert(1)', 'https://localhost', 'https://u:p@example.uz']) expect(isSafeUrl(bad), bad).toBe(false);
    expect(validateBroadcast({ audience: 'GROUP', targetId: '', includeParents: false, message: 'a', buttons: [{ text: '', url: 'http://x.uz' }] })).toEqual({
      targetId: 'Guruh yoki kursni tanlang',
      message: 'Xabar kamida 2 belgi',
      'buttons.0.text': 'Tugma matnini kiriting',
      'buttons.0.url': 'https:// bilan boshlanadigan manzil',
    });
  });
});

describe('BroadcastsPage (GAP-15)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tarix va statistika: mo‘ljal, yuborildi, yetkazildi, yetmadi', async () => {
    renderPage();
    const row = (await screen.findByText('Ertaga dars yo‘q')).closest('tr')!;
    expect(within(row).getByText('12')).toBeInTheDocument();
    expect(within(row).getAllByText('10')).toHaveLength(2);
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('Rasm')).toBeInTheDocument();
    expect(within(row).getByText('1 tugma')).toBeInTheDocument();
  });

  it('noto‘g‘ri havola — serverga bormaydi; oldindan ko‘rishsiz yuborib bo‘lmaydi; ko‘rish → tasdiq → yuborish', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('textbox', { name: /^Xabar/ }), 'Ochiq dars shanba kuni');
    await user.click(screen.getByRole('button', { name: 'Tugma qo‘shish' }));
    await user.type(screen.getByLabelText('Tugma 1 matni'), 'Ro‘yxat');
    await user.type(screen.getByLabelText('Havola'), 'http://example.uz');
    expect(screen.getByRole('button', { name: /^Yuborish/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Oldindan ko‘rish' }));
    expect(await screen.findByText('https:// bilan boshlanadigan manzil')).toBeInTheDocument();
    expect(broadcastsService.preview).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Havola'));
    await user.type(screen.getByLabelText('Havola'), 'https://example.uz/ochiq');
    await user.click(screen.getByRole('button', { name: 'Oldindan ko‘rish' }));
    const bubble = await screen.findByLabelText('Xabar ko‘rinishi');
    expect(within(bubble).getByText('Ochiq dars shanba kuni')).toBeInTheDocument();
    expect(within(bubble).getByRole('link', { name: /Ro‘yxat/ })).toHaveAttribute('href', 'https://example.uz/ochiq');

    await user.click(screen.getByRole('button', { name: 'Yuborish (42)' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/42 ta chatga yuboriladi/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Yuborish' }));
    await waitFor(() =>
      expect(broadcastsService.send).toHaveBeenCalledWith({
        audience: 'STUDENTS',
        includeParents: false,
        message: 'Ochiq dars shanba kuni',
        buttons: [{ text: 'Ro‘yxat', url: 'https://example.uz/ochiq' }],
      }),
    );
  });

  it('forma o‘zgarsa oldingi ko‘rinish eskiradi — qayta ko‘rish kerak', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole('textbox', { name: /^Xabar/ }), 'Salom hammaga');
    await user.click(screen.getByRole('button', { name: 'Oldindan ko‘rish' }));
    expect(await screen.findByRole('button', { name: 'Yuborish (42)' })).toBeEnabled();
    await user.type(screen.getByRole('textbox', { name: /^Xabar/ }), '!');
    expect(screen.getByRole('button', { name: /^Yuborish/ })).toBeDisabled();
  });
});
