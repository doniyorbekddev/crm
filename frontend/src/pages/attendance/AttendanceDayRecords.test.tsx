import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { attendanceService } from '@/services/attendance.service';
import { AttendanceDayRecords } from './AttendanceDayRecords';

const row = (id: string, firstName: string, status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED', group = 'FE-1') => ({
  id,
  status,
  note: status === 'EXCUSED' ? 'Kasal' : null,
  markedAt: '2026-10-13T09:10:00.000Z',
  markedBy: { id: 't1', firstName: 'Bobur', lastName: 'Ismoilov' },
  student: { id: `s-${id}`, code: `ST-00000${id}`, firstName, lastName: 'Test', phone: status === 'ABSENT' ? null : '+998901112233', parentPhone: '+998935557788' },
  group: { id: group, name: group, courseName: 'Frontend', startTime: '14:00' },
});

vi.mock('@/services/attendance.service', () => ({
  attendanceService: {
    dayRecords: vi.fn(async (date: string) => ({
      date,
      today: '2026-10-16',
      counts: { total: 4, PRESENT: 1, ABSENT: 1, LATE: 1, EXCUSED: 1 },
      items: [row('1', 'Ali', 'PRESENT'), row('2', 'Vali', 'ABSENT'), row('3', 'Sami', 'LATE', 'FE-2'), row('4', 'Gani', 'EXCUSED')],
    })),
  },
}));

function renderList(date = '2026-10-13') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AttendanceDayRecords date={date} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Kun davomati ro‘yxati', () => {
  it('tanlangan kun yuklanadi; holat bo‘yicha filtr soni bilan ishlaydi', async () => {
    const user = userEvent.setup();
    renderList('2026-10-13');
    expect(await screen.findByText('Test Ali')).toBeInTheDocument();
    expect(attendanceService.dayRecords).toHaveBeenCalledWith('2026-10-13');
    expect(screen.getByRole('button', { name: /Hammasi\s*4/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Kelmaganlar\s*1/ }));
    expect(screen.getByText('Test Vali')).toBeInTheDocument();
    expect(screen.queryByText('Test Ali')).toBeNull();
    // O'quvchi raqami yo'q — ota-ona raqami ko'rsatiladi
    expect(screen.getByText(/ota-ona:/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sababli\s*1/ }));
    expect(screen.getByText('Izoh: Kasal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Kech qolganlar\s*1/ }));
    expect(screen.getByText('Test Sami')).toBeInTheDocument();
  });

  it('qidiruv guruh va ism bo‘yicha toraytiradi', async () => {
    const user = userEvent.setup();
    renderList();
    await screen.findByText('Test Ali');
    await user.type(screen.getByLabelText('Kun davomatida qidirish'), 'FE-2');
    expect(screen.getByText('Test Sami')).toBeInTheDocument();
    expect(screen.queryByText('Test Ali')).toBeNull();
  });
});
