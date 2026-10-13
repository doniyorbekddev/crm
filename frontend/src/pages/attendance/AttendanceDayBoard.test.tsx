import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceDay } from '@/types/attendance';
import { AttendanceDayBoard } from './AttendanceDayBoard';

vi.mock('@/services/attendance.service', () => ({ attendanceService: { day: vi.fn() } }));
const { attendanceService } = await import('@/services/attendance.service');
const dayMock = vi.mocked(attendanceService.day);

const group = (over: Partial<AttendanceDay['groups'][number]>): AttendanceDay['groups'][number] => ({
  id: 'g1', name: 'FE-01', courseName: 'Frontend', room: '101', startTime: '14:00', endTime: '16:00', teacher: null, students: 12, marked: 0, absent: 0, state: 'NOT_STARTED', isScheduledDay: true, ...over,
});

function renderBoard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AttendanceDayBoard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AttendanceDayBoard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bugungi guruhlar karta bo‘lib chiqadi: nom, kurs, vaqt, o‘quvchilar, holat; karta — guruh davomatiga havola', async () => {
    dayMock.mockResolvedValue({
      date: '2026-09-14',
      today: '2026-09-14',
      groups: [group({}), group({ id: 'g2', name: 'BE-01', courseName: 'Backend', room: null, startTime: '18:00', endTime: '20:00', students: 8, marked: 8, absent: 2, state: 'COMPLETED' }), group({ id: 'g3', name: 'EN-01', marked: 3, state: 'IN_PROGRESS' })],
      otherGroups: [],
    });
    renderBoard();

    const first = await screen.findByRole('link', { name: 'FE-01 — davomatni ochish' });
    expect(first).toHaveAttribute('href', '/attendance/groups/g1?date=2026-09-14');
    expect(within(first).getByText('Frontend')).toBeInTheDocument();
    expect(within(first).getByText('14:00–16:00')).toBeInTheDocument();
    expect(within(first).getByText('12 o‘quvchi')).toBeInTheDocument();
    expect(within(first).getByText('101-xona')).toBeInTheDocument();
    expect(within(first).getByText('Boshlanmagan')).toBeInTheDocument();

    const done = screen.getByRole('link', { name: 'BE-01 — davomatni ochish' });
    expect(within(done).getByText('Belgilangan')).toBeInTheDocument();
    expect(within(done).getByText(/8 \/ 8 belgilangan/)).toBeInTheDocument();
    expect(within(done).getByText(/2 kelmadi/)).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'EN-01 — davomatni ochish' })).getByText('Jarayonda')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Bugungi darslar' })).toBeInTheDocument();
    expect(screen.getByText(/Dushanba, .*3 ta guruh/)).toBeInTheDocument();
    // Guruh tanlash uchun ochiladigan ro'yxat (select) yo'q
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // Sana brauzerdan emas — serverdan: birinchi so'rov sanasiz ketadi
    expect(dayMock).toHaveBeenCalledWith(undefined);
  });

  it('dars yo‘q kun — tushunarli bo‘sh holat; jadvalda yo‘q guruhlar alohida ro‘yxatda ochiladi', async () => {
    dayMock.mockResolvedValue({ date: '2026-09-13', today: '2026-09-13', groups: [], otherGroups: [{ id: 'g9', name: 'FE-02', courseName: 'Frontend', students: 5 }] });
    renderBoard();

    expect(await screen.findByText('Bugun dars yo‘q')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /davomatni ochish/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Bu kuni jadvalda yo‘q guruhlar \(1\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /FE-02/ })).toHaveAttribute('href', '/attendance/groups/g9?date=2026-09-13');
  });

  it('guruh biriktirilmagan o‘qituvchi — boshqa matn; sana o‘zgartirilsa shu sana so‘raladi va "Bugun" qaytaradi', async () => {
    dayMock.mockImplementation(async (date?: string) => ({ date: date ?? '2026-09-14', today: '2026-09-14', groups: [], otherGroups: [] }));
    const user = userEvent.setup();
    renderBoard();

    expect(await screen.findByText(/Sizga biriktirilgan faol guruh topilmadi/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bugun' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sana'), { target: { value: '2026-09-16' } });
    expect(await screen.findByText('Bu kunga dars rejalashtirilmagan')).toBeInTheDocument();
    expect(dayMock).toHaveBeenLastCalledWith('2026-09-16');
    expect(screen.getByRole('heading', { name: 'Tanlangan kun darslari' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bugun' }));
    expect(await screen.findByText('Bugun dars yo‘q')).toBeInTheDocument();
  });

  it('yuklashda xato — xato holati va qayta urinish', async () => {
    dayMock.mockRejectedValueOnce(new Error('Tarmoq xatosi'));
    renderBoard();
    expect(await screen.findByRole('button', { name: /Qayta/ })).toBeInTheDocument();
  });
});
