import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { OrgStructure } from '@/types/org';
import OrgStructurePage from './OrgStructurePage';

const STRUCTURE: OrgStructure = {
  leaders: [{ id: 'ceo', firstName: 'Doniyorbek', lastName: 'T', roleName: 'Direktor' }],
  departments: [
    {
      name: 'Sotuv va qabulxona',
      members: [
        {
          kind: 'employee',
          id: 'e1',
          userId: 'u1',
          name: 'Shodiya S',
          position: 'Sotuv menejeri',
          positionKey: 'SALES_MANAGER',
          status: 'ACTIVE',
          manager: null,
          hireDate: '2026-10-20',
          probationEndDate: '2026-11-20',
          probationDaysLeft: 17,
          onLeaveToday: false,
        },
        {
          kind: 'employee',
          id: 'e2',
          userId: null,
          name: 'Guli G',
          position: 'Qabulxona / kassir',
          positionKey: 'RECEPTIONIST',
          status: 'ON_LEAVE',
          manager: { id: 'u1', firstName: 'Shodiya', lastName: 'S' },
          hireDate: null,
          probationEndDate: null,
          probationDaysLeft: null,
          onLeaveToday: true,
        },
      ],
    },
  ],
  vacancies: [{ position: 'OPERATIONS_MANAGER', label: 'Operatsion menejer' }],
  summary: { members: 2, employees: 2, teachers: 0, onProbation: 1, onLeave: 1, withoutAccount: 1 },
};

vi.mock('@/services/org.service', () => ({ orgService: { structure: vi.fn(async () => STRUCTURE) } }));

describe('Tashkiliy tuzilma', () => {
  it('rahbar, bo‘limlar, sinov/ta’til/hisobsiz belgilari va vakant lavozimlar', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <OrgStructurePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Doniyorbek T')).toBeInTheDocument();
    const shodiya = screen.getByRole('link', { name: 'Shodiya S' }).closest('li')!;
    expect(within(shodiya).getByText('Sinovda · 17 kun')).toBeInTheDocument();
    const guli = screen.getByRole('link', { name: 'Guli G' }).closest('li')!;
    expect(within(guli).getByText(/hisobot: Shodiya S/)).toBeInTheDocument();
    expect(within(guli).getByText('Ta’tilda')).toBeInTheDocument();
    expect(within(guli).getByText('CRM hisobi yo‘q')).toBeInTheDocument();
    expect(screen.getByText('Operatsion menejer — vakant')).toBeInTheDocument();
  });
});
