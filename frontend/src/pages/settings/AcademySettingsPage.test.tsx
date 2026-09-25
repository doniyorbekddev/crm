import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcademySettings } from '@/types/settings';
import AcademySettingsPage from './AcademySettingsPage';

const base: AcademySettings = {
  name: 'IT-Academy',
  workingHours: (['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const).map((day) => ({ day, isOpen: day !== 'SUNDAY', from: '09:00', to: '18:00' })),
  currency: 'UZS',
  academicYear: { start: '2026-09-01', end: '2027-06-30' },
  timezone: 'Asia/Tashkent',
  defaultLanguage: 'uz',
  logoUrl: null,
  configured: false,
  updatedAt: null,
  updatedBy: null,
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/academySettings.service', () => ({
  academySettingsService: {
    get: vi.fn(async () => base),
    save: vi.fn(async (payload: object) => ({ data: { ...base, ...payload, configured: true, updatedAt: '2026-09-25T10:00:00.000Z' }, message: 'Markaz ma’lumotlari saqlandi' })),
    uploadLogo: vi.fn(async () => ({ data: { ...base, logoUrl: '/public/branding/logo?v=1' }, message: 'Logo yangilandi' })),
    removeLogo: vi.fn(),
    branding: vi.fn(),
  },
  brandingAssetUrl: (path: string | null) => (path ? `/api${path}` : null),
}));
const { academySettingsService } = await import('@/services/academySettings.service');

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AcademySettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AcademySettingsPage (GAP-01)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('standart qiymatlar, yakshanba yopiq, valyuta va til faqat qo‘llanadiganlari (o‘zgartirib bo‘lmaydi)', async () => {
    renderPage();
    expect(await screen.findByLabelText(/Markaz nomi/)).toHaveValue('IT-Academy');
    expect(screen.getByText('Hali saqlanmagan — standart qiymatlar ko‘rsatilmoqda.')).toBeInTheDocument();
    expect(screen.getByLabelText('Yakshanba — ochilish')).toBeDisabled();
    expect(screen.getByLabelText('Dushanba — ochilish')).toBeEnabled();
    expect(screen.getByLabelText('Valyuta')).toBeDisabled();
    expect(screen.getByLabelText('Standart til')).toBeDisabled();
  });

  it('noto‘g‘ri ish vaqti va o‘quv yili — xato ko‘rsatiladi, serverga yuborilmaydi', async () => {
    const user = userEvent.setup();
    renderPage();
    const close = await screen.findByLabelText('Dushanba — yopilish');
    await user.clear(close);
    await user.type(close, '08:00');
    const end = screen.getByLabelText(/O‘quv yili tugashi/);
    await user.clear(end);
    await user.type(end, '2026-01-01');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(screen.getByText('Tugash vaqti boshlanishdan keyin bo‘lsin')).toBeInTheDocument();
    expect(screen.getByText('O‘quv yili tugashi boshlanishidan keyin bo‘lsin')).toBeInTheDocument();
    expect(academySettingsService.save).not.toHaveBeenCalled();
  });

  it('saqlash: bo‘sh ixtiyoriy maydonlar yuborilmaydi, yopiq kun belgisi saqlanadi', async () => {
    const user = userEvent.setup();
    renderPage();
    const name = await screen.findByLabelText(/Markaz nomi/);
    await user.clear(name);
    await user.type(name, 'IT-Academy Chilonzor');
    await user.type(screen.getByLabelText('Telefon'), '+998901234567');
    await user.click(screen.getAllByLabelText('Ochiq')[5]!);
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(academySettingsService.save).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(academySettingsService.save).mock.calls[0]![0];
    expect(payload).toMatchObject({ name: 'IT-Academy Chilonzor', phone: '+998901234567', currency: 'UZS', defaultLanguage: 'uz', timezone: 'Asia/Tashkent' });
    expect(payload).not.toHaveProperty('email');
    expect(payload.workingHours.find((row) => row.day === 'SATURDAY')).toMatchObject({ isOpen: false });
  });

  it('logo yuklanadi va ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderPage();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' });
    await user.upload(await screen.findByLabelText('Logo fayli'), file);
    await waitFor(() => expect(academySettingsService.uploadLogo).toHaveBeenCalledWith(file));
    expect(await screen.findByAltText('Joriy logo')).toHaveAttribute('src', '/api/public/branding/logo?v=1');
  });
});
