import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import DataQualityPage from './DataQualityPage';

vi.mock('@/services/dataQuality.service', () => ({
  dataQualityService: {
    report: vi.fn(async () => ({
      generatedAt: '2026-10-21T10:00:00.000Z',
      activeStudents: 134,
      checks: [
        {
          key: 'parentPhoneNotImported',
          label: 'Ota-ona telefoni bor, lekin ota-ona profili yo‘q',
          impact: 'Kelmadi, qarz va haftalik hisobot xabarlari ota-onaga yuborilmaydi',
          severity: 'HIGH',
          count: 52,
          action: { label: 'O‘quvchilardan import', to: '/parents' },
          sample: [{ id: 's1', title: 'Valiyev Ali', subtitle: 'ST-000001', to: '/students/s1' }],
        },
        { key: 'groupsNoTeacher', label: 'O‘qituvchisi yo‘q faol guruhlar', impact: '…', severity: 'HIGH', count: 0, action: null, sample: [] },
      ],
    })),
  },
}));

describe('Ma’lumotlar sifati sahifasi', () => {
  it('muammoli tekshiruv soni, ta’siri va tuzatish havolasi; toza tekshiruv belgilanadi', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DataQualityPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('52')).toBeInTheDocument();
    expect(screen.getByText('Kelmadi, qarz va haftalik hisobot xabarlari ota-onaga yuborilmaydi')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /O‘quvchilardan import/ })).toHaveAttribute('href', '/parents');
    expect(screen.getByRole('link', { name: /Valiyev Ali/ })).toHaveAttribute('href', '/students/s1');
    expect(screen.getByText('Hammasi joyida')).toBeInTheDocument();
    expect(screen.getByText(/1 ta yo‘nalishda e’tibor kerak/)).toBeInTheDocument();
  });
});
