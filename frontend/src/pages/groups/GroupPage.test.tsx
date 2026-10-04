import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/auth';
import type { GroupItem } from '@/types/group';
import type { TeachingGroup } from '@/types/teaching';
import { PERMISSIONS } from '@/utils/permissionKeys';
import GroupPage from './GroupPage';

/** Dizayn PHASE 6 — guruh sahifasi: sarlavha, ruxsatga bog'liq amallar va o'quvchilar jadvali */

const GROUP: GroupItem = {
  id: 'g1',
  name: 'FE-01',
  room: null,
  roomRef: { id: 'r1', name: 'A1', capacity: 16 },
  startDate: '2026-09-01',
  endDate: null,
  scheduleDays: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
  startTime: '10:00',
  endTime: '12:00',
  capacity: 16,
  studentCount: 16,
  freeSeats: 0,
  status: 'ACTIVE',
  createdAt: '2026-08-20T00:00:00.000Z',
  course: { id: 'c1', name: 'Frontend' },
  teacher: { id: 'u9', firstName: 'Bobur', lastName: 'Ismoilov' },
};

const TEACHING = {
  group: { id: 'g1', name: 'FE-01', course: { id: 'c1', name: 'Frontend' }, students: 1 },
  students: [
    {
      id: 's1',
      code: 'ST-000045',
      firstName: 'Nilufar',
      lastName: 'Rahimova',
      attendanceRate: 55,
      homeworkRate: 90,
      examAverage: null,
      progress: 70,
      riskLevel: 'CRITICAL',
      healthScore: 31,
      reasons: ['Davomat past', 'To‘lov kechikkan'],
      factors: [],
      lastActivityAt: null,
      lastLoginAt: null,
      hasPortalAccount: false,
    },
  ],
} as unknown as TeachingGroup;

vi.mock('@/services/groups.service', () => ({ groupsService: { getById: vi.fn(async () => GROUP) } }));
vi.mock('@/services/teaching.service', () => ({ teachingService: { group: vi.fn(async () => TEACHING) } }));
vi.mock('./GroupFormModal', () => ({ GroupFormModal: () => <div role="dialog" aria-label="Guruh formasi" /> }));
vi.mock('./GroupMasteryModal', () => ({ GroupMasteryModal: () => <div role="dialog" aria-label="O‘zlashtirish" /> }));
vi.mock('@/pages/teaching/GroupAiModal', () => ({ GroupAiModal: () => <div role="dialog" aria-label="AI" /> }));
const { teachingService } = await import('@/services/teaching.service');

function setUser(permissions: string[]) {
  const user: AuthUser = {
    id: 'u1',
    email: 'a@b.uz',
    firstName: 'Ali',
    lastName: 'V',
    phone: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    role: { id: 'r', key: 'ADMIN', name: 'Admin' },
    permissions,
    mustChangePassword: false,
  };
  useAuthStore.setState({ user });
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/groups/g1']}>
        <Routes>
          <Route path="/groups/:id" element={<GroupPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Guruh sahifasi', () => {
  it('sarlavha: nom (h1), holat, kurs, o‘qituvchi, xona, jadval, o‘rinlar', async () => {
    setUser([PERMISSIONS.GROUP_VIEW]);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'FE-01' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guruhlar' })).toHaveAttribute('href', '/groups');
    expect(screen.getByText('Faol')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Bobur Ismoilov')).toBeInTheDocument();
    expect(screen.getByText('A1-xona')).toBeInTheDocument();
    expect(screen.getByText('/ 16 o‘rin')).toBeInTheDocument();
    // Bo'sh o'rin yo'q — to'lgan
    expect(screen.getByText('to‘lgan')).toBeInTheDocument();
  });

  it('faqat ko‘rish ruxsati: boshqaruv amallari yo‘q, o‘quvchilar so‘rovi yuborilmaydi', async () => {
    setUser([PERMISSIONS.GROUP_VIEW]);
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('button', { name: 'Mavzular bo‘yicha' })).toBeInTheDocument();
    for (const name of ['Tahrirlash', 'AI tahlil']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Davomat' })).not.toBeInTheDocument();
    expect(screen.getByText('O‘quvchilar ko‘rsatkichlari yopiq')).toBeInTheDocument();
    expect(teachingService.group).not.toHaveBeenCalled();
  });

  it('boshqaruvchi: amallar, davomat havolasi va o‘quvchilar jadvali (xavf sabablari bilan)', async () => {
    setUser([PERMISSIONS.GROUP_VIEW, PERMISSIONS.GROUP_MANAGE, PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.AI_ACADEMIC]);
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('link', { name: 'Davomat' })).toHaveAttribute('href', '/attendance?groupId=g1');
    expect(screen.getByRole('button', { name: 'Tahrirlash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI tahlil' })).toBeInTheDocument();

    const table = await screen.findByRole('table', { name: 'FE-01 o‘quvchilari' });
    const row = within(table).getByRole('row', { name: /Rahimova Nilufar/ });
    expect(within(row).getByRole('link', { name: 'Rahimova Nilufar' })).toHaveAttribute('href', '/students/s1');
    expect(within(row).getByText('55%')).toHaveClass('text-danger');
    expect(within(row).getByText('90%')).toHaveClass('text-success');
    expect(within(row).getByText('Kritik')).toBeInTheDocument();
    expect(row).toHaveTextContent('Davomat past; To‘lov kechikkan');
    expect(row).toHaveTextContent('Kabinet ochilmagan');
  });
});
