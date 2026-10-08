import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import { useUiStore } from '@/store/ui.store';
import type { AuthUser } from '@/types/auth';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { NAV_SECTIONS, findNavEntry } from './navigation';
import { NotificationBell } from './NotificationBell';
import { ShellBreadcrumb } from './ShellBreadcrumb';
import { Sidebar } from './Sidebar';

/** Dizayn PHASE 2 — ilova qobig'i: navigatsiya guruhlari, sidebar, yo'l, bildirishnomalar paneli */

vi.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ name: 'IT-Academy', logoUrl: null }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/notifications.service', () => ({
  notificationsService: {
    summary: vi.fn(async () => ({ unread: 3, unreadHigh: 1 })),
    list: vi.fn(async (params: { unreadOnly?: string; priority?: string }) => ({
      items: params.priority
        ? []
        : [
            {
              id: 'n1',
              type: 'NEW_PAYMENT',
              title: 'Yangi to‘lov',
              message: 'Ali Valiyev 500 000 so‘m to‘ladi',
              priority: 'HIGH',
              isRead: false,
              entityType: 'payment',
              entityId: 'p1',
              createdAt: new Date().toISOString(),
            },
          ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })),
    markRead: vi.fn(async () => ({})),
    markAllRead: vi.fn(async () => ({ data: { count: 3 }, message: 'Hammasi o‘qildi' })),
  },
}));
const { notificationsService } = await import('@/services/notifications.service');

function userWith(permissions: string[]): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.uz',
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: { id: 'r1', key: 'ADMIN', name: 'Admin' },
    permissions,
    mustChangePassword: false,
  };
}

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useUiStore.setState({ sidebarCollapsed: false, mobileSidebarOpen: false, collapsedNavSections: [] });
  useAuthStore.setState({ user: userWith([PERMISSIONS.STUDENT_VIEW, PERMISSIONS.GROUP_VIEW, PERMISSIONS.PAYMENT_VIEW]) });
});

describe('navigatsiya tuzilmasi', () => {
  it('8 guruh; har marshrut bitta guruhda va takrorlanmaydi', () => {
    expect(NAV_SECTIONS.map((section) => section.title)).toEqual(['Umumiy', 'Sotuv', 'O‘quv jarayoni', 'Moliya', 'Odamlar', 'Analitika', 'Avtomatlashtirish', 'Tizim']);
    const routes = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.to));
    expect(routes).toHaveLength(47);
    expect(new Set(routes).size).toBe(47);
    expect(new Set(NAV_SECTIONS.map((section) => section.id)).size).toBe(NAV_SECTIONS.length);
    for (const section of NAV_SECTIONS) expect(section.items.length, section.title).toBeLessThanOrEqual(10);
  });

  it('findNavEntry: aniq va ichki sahifa, eng uzun mos yo‘l; noma’lum — null', () => {
    expect(findNavEntry('/students')?.item.label).toBe('O‘quvchilar');
    expect(findNavEntry('/students/abc123')?.section.title).toBe('O‘quv jarayoni');
    expect(findNavEntry('/settings/academy')?.item.label).toBe('Markaz ma’lumotlari');
    // "/finance" va "/financexyz" aralashmaydi
    expect(findNavEntry('/financexyz')).toBeNull();
    expect(findNavEntry('/portal')).toBeNull();
  });
});

describe('Sidebar', () => {
  it('faqat ruxsat berilgan bandlar; ruxsatsiz guruh umuman chiqmaydi', () => {
    renderAt('/students', <Sidebar />);
    const nav = screen.getByRole('complementary', { name: 'Asosiy menyu' });
    expect(within(nav).getByRole('link', { name: 'O‘quvchilar' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Guruhlar' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'To‘lovlar' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Leadlar' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Sotuv' })).not.toBeInTheDocument();
    // Ruxsat talab qilmaydigan bandlar hamma uchun
    expect(within(nav).getByRole('link', { name: 'Profil' })).toBeInTheDocument();
  });

  it('bo‘lim yig‘iladi va tanlov saqlanadi; joriy sahifa bo‘limi yopilmaydi', async () => {
    renderAt('/students', <Sidebar />);
    const finance = screen.getByRole('button', { name: 'Moliya' });
    expect(finance).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(finance);
    expect(finance).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'To‘lovlar' })).not.toBeInTheDocument();
    expect(useUiStore.getState().collapsedNavSections).toEqual(['finance']);
    await userEvent.click(finance);
    expect(screen.getByRole('link', { name: 'To‘lovlar' })).toBeInTheDocument();

    const academic = screen.getByRole('button', { name: 'O‘quv jarayoni' });
    expect(academic).toBeDisabled();
    expect(academic).toHaveAttribute('aria-expanded', 'true');
  });

  it('yig‘ilgan bo‘limdagi sahifaga o‘tilsa — bo‘lim o‘zi ochiladi', () => {
    useUiStore.setState({ collapsedNavSections: ['finance', 'academic'] });
    renderAt('/payments', <Sidebar />);
    expect(screen.getByRole('link', { name: 'To‘lovlar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'O‘quvchilar' })).not.toBeInTheDocument();
  });

  it('ikonkali (72px) ko‘rinish: havola nomlari saqlanadi, bo‘lim tugmalari yo‘q, hamma band ko‘rinadi', () => {
    useUiStore.setState({ sidebarCollapsed: true, collapsedNavSections: ['finance'] });
    renderAt('/students', <Sidebar />);
    expect(screen.getByRole('link', { name: 'To‘lovlar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Moliya' })).not.toBeInTheDocument();
  });

  it('telefon: menyu ochiq bo‘lsa Esc va "Menyuni yopish" yopadi', async () => {
    useUiStore.setState({ mobileSidebarOpen: true });
    renderAt('/students', <Sidebar />);
    await userEvent.keyboard('{Escape}');
    expect(useUiStore.getState().mobileSidebarOpen).toBe(false);
    useUiStore.setState({ mobileSidebarOpen: true });
    await userEvent.click(screen.getByRole('button', { name: 'Menyuni yopish' }));
    expect(useUiStore.getState().mobileSidebarOpen).toBe(false);
  });
});

describe('ShellBreadcrumb', () => {
  it('ro‘yxat sahifasi: "Bo‘lim › Sahifa" (joriy); ichki sahifa: sahifa nomi ro‘yxatga havola', () => {
    const { unmount } = renderAt('/students', <ShellBreadcrumb />);
    const nav = screen.getByRole('navigation', { name: 'Sahifa yo‘li' });
    expect(nav).toHaveTextContent('O‘quv jarayoni');
    expect(within(nav).getByText('O‘quvchilar')).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link')).not.toBeInTheDocument();
    unmount();

    renderAt('/students/abc', <ShellBreadcrumb />);
    expect(screen.getByRole('link', { name: 'O‘quvchilar' })).toHaveAttribute('href', '/students');
  });

  it('menyuda yo‘q sahifa — hech narsa chizilmaydi', () => {
    renderAt('/nomalum', <ShellBreadcrumb />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});

describe('Bildirishnomalar paneli', () => {
  it('qo‘ng‘iroqcha nomi o‘qilmaganlar bilan; panel dialog bo‘lib ochiladi; filtrlar API parametrlari bilan', async () => {
    renderAt('/students', <NotificationBell />);
    const bell = await screen.findByRole('button', { name: 'Bildirishnomalar (3 ta o‘qilmagan, 1 tasi muhim)' });
    expect(notificationsService.list).not.toHaveBeenCalled();
    await userEvent.click(bell);

    const dialog = screen.getByRole('dialog', { name: 'Bildirishnomalar' });
    expect(await within(dialog).findByText('Yangi to‘lov')).toBeInTheDocument();
    expect(notificationsService.list).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    expect(within(dialog).getByRole('link', { name: 'Barchasini ko‘rish' })).toHaveAttribute('href', '/notifications');

    await userEvent.click(within(dialog).getByRole('tab', { name: /O‘qilmagan/ }));
    expect(notificationsService.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, unreadOnly: 'true' });

    await userEvent.click(within(dialog).getByRole('tab', { name: /Muhim/ }));
    expect(notificationsService.list).toHaveBeenLastCalledWith({ page: 1, limit: 20, priority: 'HIGH' });
    expect(await within(dialog).findByText('Muhim bildirishnoma yo‘q')).toBeInTheDocument();
  });

  it('bildirishnoma bosilsa — o‘qilgan deb belgilanadi va panel yopiladi; "Hammasini o‘qish"; kabinet havolasi', async () => {
    renderAt('/portal', <NotificationBell listPath="/portal/notifications" />);
    await userEvent.click(await screen.findByRole('button', { name: /Bildirishnomalar/ }));
    const dialog = screen.getByRole('dialog', { name: 'Bildirishnomalar' });
    expect(within(dialog).getByRole('link', { name: 'Barchasini ko‘rish' })).toHaveAttribute('href', '/portal/notifications');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hammasini o‘qish' }));
    expect(notificationsService.markAllRead).toHaveBeenCalledOnce();

    await userEvent.click(await within(dialog).findByRole('button', { name: /Yangi to‘lov/ }));
    expect(notificationsService.markRead).toHaveBeenCalledWith('n1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
