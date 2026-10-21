import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { studentsService } from '@/services/students.service';
import type { StudentItem } from '@/types/student';
import { StudentGroupsCard } from './StudentGroupsCard';

vi.mock('@/services/students.service', () => ({
  studentsService: {
    formLookups: vi.fn(async () => ({
      courses: [
        { id: 'c1', name: 'PMT Matematika', finalPrice: 1_000_000 },
        { id: 'c2', name: 'PMT Ingliz tili', finalPrice: 1_000_000 },
      ],
      groups: [
        { id: 'g1', name: 'PMT-MATH-1', courseId: 'c1', capacity: 10, studentCount: 3, freeSeats: 7 },
        { id: 'g2', name: 'PMT-ENG-1', courseId: 'c2', capacity: 10, studentCount: 3, freeSeats: 7 },
        { id: 'g3', name: 'PMT-ENG-2', courseId: 'c2', capacity: 10, studentCount: 3, freeSeats: 7 },
      ],
    })),
    addGroup: vi.fn(async () => ({ data: {}, message: 'O‘quvchi qo‘shimcha guruhga qo‘shildi' })),
    removeGroup: vi.fn(async () => ({ data: {}, message: 'Chiqarildi' })),
    setGroupShare: vi.fn(async () => ({ data: {}, message: 'O‘qituvchi ulushi saqlandi' })),
  },
}));
let salaryPermission = false;
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => salaryPermission }));

const STUDENT = {
  id: 's1',
  code: 'ST-000001',
  firstName: 'Ali',
  lastName: 'Valiyev',
  course: { id: 'c1', name: 'PMT Matematika' },
  group: { id: 'g1', name: 'PMT-MATH-1' },
  extraGroups: [
    {
      membershipId: 'm1',
      joinedAt: '2026-10-01T00:00:00.000Z',
      id: 'g2',
      name: 'PMT-ENG-1',
      course: { id: 'c2', name: 'PMT Ingliz tili' },
      teacher: { id: 't2', firstName: 'Dilnoza', lastName: 'Karimova' },
      scheduleDays: ['TUESDAY', 'THURSDAY'],
      startTime: '14:00',
      endTime: '15:30',
      commissionShare: 0,
    },
  ],
} as unknown as StudentItem;

function renderCard(canManage = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <StudentGroupsCard student={STUDENT} canManage={canManage} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('O‘quvchining guruhlari (PMT)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    salaryPermission = false;
  });

  it('asosiy va qo‘shimcha guruh: fan, o‘qituvchi, jadval; to‘lov asosiy guruh bo‘yicha', () => {
    renderCard();
    expect(screen.getByText('PMT-MATH-1')).toBeInTheDocument();
    expect(screen.getByText('Asosiy')).toBeInTheDocument();
    expect(screen.getByText('Oylik to‘lov shu guruh bo‘yicha')).toBeInTheDocument();
    expect(screen.getByText(/PMT Ingliz tili · Dilnoza Karimova · Se, Pa · 14:00–15:30/)).toBeInTheDocument();
  });

  it('qo‘shish oynasida allaqachon a’zo bo‘lgan guruhlar chiqmaydi', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Qo‘shimcha guruh' }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('option', { name: /PMT-ENG-2/ });
    expect(within(dialog).queryByRole('option', { name: /PMT-MATH-1/ })).toBeNull();
    expect(within(dialog).queryByRole('option', { name: /PMT-ENG-1/ })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText(/^Guruh/), 'g3');
    await user.click(within(dialog).getByRole('button', { name: 'Qo‘shish' }));
    await vi.waitFor(() => expect(studentsService.addGroup).toHaveBeenCalledWith('s1', { groupId: 'g3' }));
  });

  it('ruxsatsiz xodimga boshqaruv tugmalari ko‘rinmaydi', () => {
    renderCard(false);
    expect(screen.queryByRole('button', { name: 'Qo‘shimcha guruh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chiqarish' })).toBeNull();
  });

  it('ulush: faqat maosh huquqi bilan; 100% dan oshsa saqlab bo‘lmaydi; namuna bo‘linish ko‘rsatiladi', async () => {
    const user = userEvent.setup();
    renderCard();
    expect(screen.queryByRole('button', { name: 'Ulush' })).toBeNull();
    salaryPermission = true;
    renderCard();
    await user.click(screen.getAllByRole('button', { name: 'Ulush' })[0]!);
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/Ulush, %/);
    await user.clear(input);
    await user.type(input, '120');
    expect(within(dialog).getByRole('button', { name: 'Saqlash' })).toBeDisabled();
    await user.clear(input);
    await user.type(input, '40');
    expect(within(dialog).getByText(/^Masalan,/)).toHaveTextContent(/400.000.*600.000/);
    await user.click(within(dialog).getByRole('button', { name: 'Saqlash' }));
    await vi.waitFor(() => expect(studentsService.setGroupShare).toHaveBeenCalledWith('s1', 'g2', 40));
  });
});
