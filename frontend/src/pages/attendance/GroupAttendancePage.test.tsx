import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceSheet, AttendanceStatus } from '@/types/attendance';
import GroupAttendancePage from './GroupAttendancePage';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => true }));
vi.mock('@/services/groups.service', () => ({ groupsService: { getById: vi.fn().mockResolvedValue({ id: 'g1', course: { id: 'c1' } }) } }));
vi.mock('@/services/curriculum.service', () => ({ curriculumService: { forCourse: vi.fn().mockResolvedValue({ modules: [] }) } }));
vi.mock('@/services/attendance.service', () => ({ attendanceService: { sheet: vi.fn(), mark: vi.fn(), day: vi.fn() } }));
const { attendanceService } = await import('@/services/attendance.service');
const sheetMock = vi.mocked(attendanceService.sheet);
const markMock = vi.mocked(attendanceService.mark);
const dayMock = vi.mocked(attendanceService.day);

const row = (studentId: string, firstName: string, status: AttendanceStatus | null) => ({ studentId, code: `ST-${studentId}`, firstName, lastName: 'Test', phone: '+998901234567', status, note: null, markedAt: null, markedBy: null });
function sheet(over: Partial<AttendanceSheet> = {}): AttendanceSheet {
  const students = over.students ?? [row('s1', 'Ali', null), row('s2', 'Vali', 'PRESENT'), row('s3', 'Sami', null)];
  return {
    session: null,
    sessionStatus: null,
    today: '2026-09-14',
    group: { id: 'g1', name: 'FE-01', courseName: 'Frontend', room: '101', startTime: '14:00', endTime: '16:00', scheduleDays: ['MONDAY'], teacher: null },
    date: '2026-09-14',
    isScheduledDay: true,
    canMark: true,
    formerStudents: [],
    summary: { PRESENT: 1, ABSENT: 0, LATE: 0, EXCUSED: 0, unmarked: 2, total: 3 },
    ...over,
    students,
  };
}

function open(path = '/attendance/groups/g1?date=2026-09-14') {
  const router = createMemoryRouter(
    [
      { path: '/attendance/groups/:groupId', element: (<><Link to="/attendance">Chiqish</Link><GroupAttendancePage /></>) },
      { path: '/attendance', element: <p>Davomat taxtasi</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const rowOf = (name: string) => screen.getByRole('group', { name: `${name} Test davomati` });

describe('GroupAttendancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sheetMock.mockResolvedValue(sheet());
  });

  it('faqat shu guruh o‘quvchilari, mavjud belgilar va dars ma’lumoti ko‘rinadi; holat — tugmalar (select emas)', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'FE-01' })).toBeInTheDocument();
    expect(screen.getByText(/Frontend · .* · 14:00–16:00 · 101-xona/)).toBeInTheDocument();
    expect(sheetMock).toHaveBeenCalledWith('g1', '2026-09-14');

    expect(screen.getAllByRole('group', { name: /davomati$/ })).toHaveLength(3);
    expect(within(rowOf('Ali')).getAllByRole('button').map((button) => button.textContent)).toEqual(['Keldi', 'Kechikdi', 'Sababli', 'Kelmadi']);
    // Avval saqlangan belgi yuklangan; belgilanmagan o'quvchida hech bir holat tanlanmagan
    expect(within(rowOf('Vali')).getByRole('button', { name: 'Keldi' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rowOf('Ali')).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Davomat to‘ldirilishi' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Belgilanmagan: 2')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
  });

  it('belgilash darhol ko‘rinadi; faqat o‘zgarganlar yuboriladi; belgilanmagan o‘quvchi "kelmadi" qilib yuborilmaydi', async () => {
    markMock.mockResolvedValue({ message: 'Davomat saqlandi', data: sheet({ students: [row('s1', 'Ali', 'ABSENT'), row('s2', 'Vali', 'LATE'), row('s3', 'Sami', null)] }) });
    const user = userEvent.setup();
    open();
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });

    await user.click(within(rowOf('Ali')).getByRole('button', { name: 'Kelmadi' }));
    expect(within(rowOf('Ali')).getByRole('button', { name: 'Kelmadi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('1 ta saqlanmagan o‘zgarish')).toBeInTheDocument();

    await user.click(within(rowOf('Vali')).getByRole('button', { name: 'Kechikdi' }));
    // Qaytarib avvalgi holatga qo'yilsa — o'zgarish hisoblanmaydi
    await user.click(within(rowOf('Vali')).getByRole('button', { name: 'Keldi' }));
    expect(screen.getByRole('button', { name: 'Saqlash (1)' })).toBeEnabled();
    await user.click(within(rowOf('Vali')).getByRole('button', { name: 'Kechikdi' }));

    await user.click(screen.getByRole('button', { name: 'Saqlash (2)' }));
    await waitFor(() => expect(markMock).toHaveBeenCalledTimes(1));
    expect(markMock).toHaveBeenCalledWith('g1', { date: '2026-09-14', records: [{ studentId: 's1', status: 'ABSENT' }, { studentId: 's2', status: 'LATE' }] });

    expect(await screen.findByText('Saqlandi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
    expect(within(rowOf('Sami')).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it('saqlash xatosi ko‘rsatiladi va belgilar yo‘qolmaydi; saqlanayotganda ikkinchi so‘rov ketmaydi', async () => {
    let reject!: (error: Error) => void;
    markMock.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const user = userEvent.setup();
    open();
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });

    await user.click(within(rowOf('Ali')).getByRole('button', { name: 'Keldi' }));
    const saveButton = screen.getByRole('button', { name: 'Saqlash (1)' });
    await user.click(saveButton);
    await waitFor(() => expect(saveButton).toBeDisabled());
    expect(within(rowOf('Ali')).getByRole('button', { name: 'Kelmadi' })).toBeDisabled();
    await user.click(saveButton);
    expect(markMock).toHaveBeenCalledTimes(1);

    reject(new Error('Server javob bermadi'));
    const alert = await screen.findByText('Davomat saqlanmadi');
    expect(alert.closest('[role="alert"]') ?? alert.parentElement).toHaveTextContent(/Belgilaringiz yo‘qolmadi/);
    expect(within(rowOf('Ali')).getByRole('button', { name: 'Keldi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Saqlash (1)' })).toBeEnabled();
  });

  it('saqlanmagan o‘zgarish bilan chiqishda tasdiq so‘raladi: "Qolish" — belgilar joyida, "Saqlamasdan chiqish" — chiqadi', async () => {
    const user = userEvent.setup();
    const router = open();
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });

    await user.click(within(rowOf('Sami')).getByRole('button', { name: 'Sababli' }));
    expect(screen.getByLabelText('Dars sanasi')).toBeDisabled();
    await user.click(screen.getByRole('link', { name: 'Chiqish' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Saqlanmagan o‘zgarishlar bor' });
    expect(router.state.location.pathname).toBe('/attendance/groups/g1');
    await user.click(within(dialog).getByRole('button', { name: 'Qolish' }));
    expect(within(rowOf('Sami')).getByRole('button', { name: 'Sababli' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('link', { name: 'Chiqish' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Saqlamasdan chiqish' }));
    expect(await screen.findByText('Davomat taxtasi')).toBeInTheDocument();
    expect(markMock).not.toHaveBeenCalled();
  });

  it('o‘zgarish bo‘lmasa chiqish erkin; "Hammasi keldi" barchani belgilaydi', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });

    await user.click(screen.getByRole('button', { name: 'Hammasi keldi' }));
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
    // Vali allaqachon "keldi" edi — o'zgarish 2 ta
    expect(screen.getByRole('button', { name: 'Saqlash (2)' })).toBeEnabled();
  });

  it('ko‘rish huquqi bor, belgilash huquqi yo‘q — tugmalar o‘chirilgan, saqlash yo‘q; chiqqan o‘quvchi faqat tarixda', async () => {
    sheetMock.mockResolvedValue(sheet({ canMark: false, formerStudents: [row('s9', 'Ketgan', 'LATE')], isScheduledDay: false, sessionStatus: 'CANCELLED', today: '2026-09-20' }));
    open();
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });

    for (const button of within(rowOf('Ali')).getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Saqlash/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hammasi keldi' })).not.toBeInTheDocument();

    const former = screen.getByRole('region', { name: 'Guruhdan chiqqan o‘quvchilar' });
    expect(within(former).getByText(/Ketgan Test/)).toBeInTheDocument();
    expect(within(former).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Ketgan Test davomati' })).not.toBeInTheDocument();

    expect(screen.getByText(/Bu kun guruh jadvalida yo‘q/)).toBeInTheDocument();
    expect(screen.getByText(/bekor qilingan/)).toBeInTheDocument();
    expect(screen.getByText(/bugungi emas/)).toBeInTheDocument();
  });

  it('sana berilmasa bugungi sana serverdan olinadi; begona guruh (404) — xato holati', async () => {
    dayMock.mockResolvedValue({ date: '2026-09-14', today: '2026-09-14', groups: [], otherGroups: [] });
    const router = open('/attendance/groups/g1');
    await screen.findByRole('heading', { level: 1, name: 'FE-01' });
    expect(router.state.location.search).toBe('?date=2026-09-14');
  });

  it('jurnal yuklanmasa (masalan begona guruh — 404) o‘quvchilar ko‘rsatilmaydi', async () => {
    sheetMock.mockRejectedValue(new Error('Guruh topilmadi'));
    open();
    expect(await screen.findByRole('button', { name: /Qayta/ })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /davomati$/ })).not.toBeInTheDocument();
  });
});
