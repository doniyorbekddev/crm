import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherProfilePage from '@/pages/teachers/TeacherProfilePage';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types/auth';
import type { StudentProfile } from '@/types/studentProfile';
import type { TeacherDetail } from '@/types/teacher';
import { PERMISSIONS } from '@/utils/permissionKeys';
import StudentProfilePage from './StudentProfilePage';

/** Dizayn PHASE 5 — O'quvchi 360 va o'qituvchi profili: sarlavha, ruxsatga bog'liq amallar, bo'limlar */

const PROFILE = {
  student: {
    id: 's1',
    code: 'ST-000045',
    firstName: 'Nilufar',
    lastName: 'Rahimova',
    phone: '+998979370561',
    status: 'ACTIVE',
    riskLevel: 'AT_RISK',
    startDate: '2026-09-01',
    referralCode: 'NIL45',
    course: { id: 'c1', name: 'Frontend' },
    group: { id: 'g1', name: 'FE-01' },
    debt: { total: 4_800_000, remaining: 1_200_000 },
  },
  gamification: {
    totalXp: 510,
    level: { number: 4, name: 'Faol o‘quvchi', icon: null, minXp: 400 },
    nextLevel: { number: 5, name: 'Usta', minXp: 800, xpLeft: 290 },
    progress: 28,
    rank: 2,
    streak: { current: 4, longest: 9, lastAttendanceDate: null },
    badges: [],
    recentXp: [],
  },
  attendance: { total: 20, present: 16, absent: 4, late: 0, excused: 0, rate: 80 },
  payments: { total: 3 },
} as unknown as StudentProfile;

const TEACHER = {
  id: 't1',
  user: { id: 'u9', firstName: 'Bobur', lastName: 'Ismoilov', email: 'bobur@example.uz', phone: '+998901112233', status: 'ACTIVE', roleName: 'O‘qituvchi' },
  specialization: 'Frontend',
  experienceYears: 5,
  hireDate: '2024-02-01',
  bio: null,
  isActive: true,
  employmentStatus: 'ACTIVE',
  terminationDate: null,
  documents: 0,
  groups: 2,
  students: 31,
  lessonsThisMonth: 12,
  salaryRule: null,
  salaryVisible: false,
  createdAt: '2024-02-01T00:00:00.000Z',
  groupList: [{ id: 'g1', name: 'FE-01', course: { name: 'Frontend' }, scheduleDays: ['MONDAY'], startTime: '10:00', endTime: '12:00', room: 'A1', status: 'ACTIVE', students: 16 }],
  performance: {
    year: 2026,
    month: 10,
    label: '2026-yil oktabr',
    lessonsHeld: 12,
    lessonsPlanned: 14,
    lessonsCancelled: 1,
    attendanceRate: 91,
    attendance: { total: 180, absent: 16 },
    homework: 6,
    exams: 2,
    revenue: 18_000_000,
    studentCount: 31,
    retentionRate: 94,
    homeworkCompletionRate: null,
    examAveragePercent: 78,
    satisfaction: { average: 4.6, responses: 12 },
  },
  salaryRules: [],
  salaryPeriods: [],
  salaryTotals: null,
} as unknown as TeacherDetail;

vi.mock('@/hooks/useBranding', () => ({ useBranding: () => ({ name: 'IT-Academy', logoUrl: null }) }));
vi.mock('@/services/students.service', () => ({ studentsService: { profile: vi.fn(async () => PROFILE) } }));
vi.mock('@/services/teachers.service', () => ({ teachersService: { detail: vi.fn(async () => TEACHER) } }));
// Bo'limlar mazmuni o'z testlarida — bu yerda sahifa qobig'i tekshiriladi
vi.mock('./profile/ProfileTabs', () => ({
  OverviewTab: () => <p>Umumiy mazmuni</p>,
  HomeworkTab: () => <p>Vazifalar mazmuni</p>,
  ExamsTab: () => null,
  PaymentsTab: () => <p>To‘lovlar mazmuni</p>,
  AchievementsTab: () => null,
  ActivityTab: () => null,
}));
vi.mock('./profile/MasteryTab', () => ({ MasteryTab: () => null }));
vi.mock('./profile/AiAnalysisTab', () => ({ AiAnalysisTab: () => <p>AI mazmuni</p> }));
vi.mock('./profile/GroupHistoryTab', () => ({ GroupHistoryTab: () => <p>Guruh tarixi mazmuni</p> }));
vi.mock('./profile/ParentsTab', () => ({ ParentsTab: () => null }));
vi.mock('./profile/PaymentScheduleTab', () => ({ PaymentScheduleTab: () => <p>Jadval mazmuni</p> }));
vi.mock('./StudentFormModal', () => ({ StudentFormModal: () => <div role="dialog" aria-label="Tahrirlash oynasi" /> }));
vi.mock('./StudentStatusModal', () => ({ StudentStatusModal: () => <div role="dialog" aria-label="Holat oynasi" /> }));
vi.mock('./StudentAttendanceModal', () => ({ StudentAttendanceModal: () => <div role="dialog" aria-label="Davomat oynasi" /> }));
vi.mock('@/pages/payments/PaymentFormModal', () => ({ PaymentFormModal: () => <div role="dialog" aria-label="To‘lov oynasi" /> }));
vi.mock('@/components/weekly/WeeklyReportModal', () => ({ WeeklyReportModal: () => <div role="dialog" aria-label="Hisobot oynasi" /> }));

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

function renderAt(path: string, pattern: string, element: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('O‘quvchi profili (Student 360)', () => {
  it('sarlavha: ism (h1), holat va xavf belgisi, asosiy ma’lumotlar, ko‘rsatkichlar', async () => {
    setUser([]);
    renderAt('/students/s1', '/students/:id', <StudentProfilePage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nilufar Rahimova' })).toBeInTheDocument();
    expect(screen.getByText('O‘qimoqda')).toBeInTheDocument();
    expect(screen.getByText('Xavf ostida')).toBeInTheDocument();
    expect(screen.getByText('ST-000045')).toBeInTheDocument();
    expect(screen.getByText('FE-01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'O‘quvchilar' })).toHaveAttribute('href', '/students');
    expect(screen.getByText('#2')).toBeInTheDocument();
    // Davomat 80% — 85% dan past: ogohlantirish rangi
    expect(screen.getByText('80%')).toHaveClass('text-warning');
    expect(screen.getByText(/510 XP · keyingisiga 290/)).toBeInTheDocument();
  });

  it('ruxsatsiz xodim: boshqaruv amallari yo‘q; faqat umumiy bo‘limlar', async () => {
    setUser([]);
    renderAt('/students/s1', '/students/:id', <StudentProfilePage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByRole('button', { name: 'Haftalik hisobot' })).toBeInTheDocument();
    for (const name of ['To‘lov qabul qilish', 'Tahrirlash', 'Yana']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    const tabs = within(screen.getByRole('tablist', { name: 'Profil bo‘limlari' })).getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Umumiy', 'O‘zlashtirish', 'Guruh tarixi', 'To‘lovlar', 'Yutuqlar', 'Faollik']);
  });

  it('to‘liq ruxsat: to‘lov, tahrirlash, "Yana" menyusi va barcha bo‘limlar; tab almashadi', async () => {
    setUser([
      PERMISSIONS.STUDENT_MANAGE,
      PERMISSIONS.PAYMENT_CREATE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.AI_ACADEMIC,
      PERMISSIONS.PARENT_VIEW,
      PERMISSIONS.HOMEWORK_VIEW,
      PERMISSIONS.EXAM_VIEW,
      PERMISSIONS.DEBT_VIEW,
    ]);
    renderAt('/students/s1', '/students/:id', <StudentProfilePage />);
    await screen.findByRole('heading', { level: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'To‘lov qabul qilish' }));
    expect(screen.getByRole('dialog', { name: 'To‘lov oynasi' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yana' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Davomat kalendari', 'Holatni o‘zgartirish']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Holatni o‘zgartirish' }));
    expect(screen.getByRole('dialog', { name: 'Holat oynasi' })).toBeInTheDocument();

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Umumiy mazmuni');
    await userEvent.click(screen.getByRole('tab', { name: 'To‘lov jadvali' }));
    expect(screen.getByRole('tabpanel', { name: 'To‘lov jadvali' })).toHaveTextContent('Jadval mazmuni');
    await userEvent.click(screen.getByRole('tab', { name: 'AI tahlil' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('AI mazmuni');
    await userEvent.click(screen.getByRole('tab', { name: 'Guruh tarixi' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Guruh tarixi mazmuni');
  });
});

describe('O‘qituvchi profili (sahifa)', () => {
  it('sarlavha va ko‘rsatkichlar; guruhlar; maosh — ruxsatsiz yopiq', async () => {
    setUser([]);
    renderAt('/teachers/t1', '/teachers/:id', <TeacherProfilePage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bobur Ismoilov' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'O‘qituvchilar' })).toHaveAttribute('href', '/teachers');
    expect(screen.getByText('bobur@example.uz')).toBeInTheDocument();

    const performance = screen.getByRole('region', { name: '2026-yil oktabr ko‘rsatkichlari' });
    expect(within(performance).getByText('91%')).toBeInTheDocument();
    expect(within(performance).getByText('1 ta bekor qilingan')).toBeInTheDocument();
    expect(within(performance).getByText('Bu oyda vazifa berilmagan')).toBeInTheDocument();
    expect(within(performance).getByText('4.6 / 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Guruhlar/ }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('FE-01');

    await userEvent.click(screen.getByRole('tab', { name: 'Maosh' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Maosh ma’lumotlarini ko‘rish uchun ruxsat yo‘q');
    expect(screen.queryByText('Maosh tarixi')).not.toBeInTheDocument();
  });
});
