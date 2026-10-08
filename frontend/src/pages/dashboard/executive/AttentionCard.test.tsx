import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AttentionCard } from './ExecutiveCards';

describe('AttentionCard', () => {
  it('havolasi bor chip — filtrli sahifaga olib boradi; havolasiz chip oddiy matn bo‘lib qoladi', () => {
    render(
      <MemoryRouter>
        <AttentionCard
          items={[
            { key: 'criticalAlerts', label: 'Kritik ogohlantirishlar', value: 3, tone: 'danger', link: '/alerts?severity=CRITICAL' },
            { key: 'overdueTasks', label: 'Muddati o‘tgan vazifalar', value: 12, tone: 'danger', link: '/tasks?scope=all&overdue=1' },
            { key: 'legacy', label: 'Eski server javobi', value: 1, tone: 'warning' },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /Kritik ogohlantirishlar\s*3/ })).toHaveAttribute('href', '/alerts?severity=CRITICAL');
    expect(screen.getByRole('link', { name: /Muddati o‘tgan vazifalar\s*12/ })).toHaveAttribute('href', '/tasks?scope=all&overdue=1');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('Eski server javobi')).toBeInTheDocument();
  });
});
