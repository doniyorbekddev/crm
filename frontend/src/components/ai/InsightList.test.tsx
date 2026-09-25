import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiSourceBadge, InsightList } from './InsightList';

/** TZ §60: fakt / kuzatuv / tavsiya alohida — o'qituvchi CRM raqamini AI xulosasidan ajratadi */
describe('InsightList', () => {
  it('turlar alohida bo‘limlarda, tartib: fakt → kuzatuv → tavsiya; bo‘sh bo‘lim chiqmaydi', () => {
    render(
      <InsightList
        items={[
          { type: 'RECOMMENDATION', text: 'Takrorlash darsi' },
          { type: 'FACT', text: 'Davomat: 70%' },
          { type: 'FACT', text: 'Imtihon: 55%' },
        ]}
      />,
    );
    const regions = screen.getAllByRole('region');
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual(['Fakt', 'Tavsiya']);
    expect(within(regions[0]!).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Davomat: 70%', 'Imtihon: 55%']);
    expect(screen.queryByRole('region', { name: 'Kuzatuv' })).not.toBeInTheDocument();
  });

  it('manba belgisi: qoidalar rejimi yoki model nomi', () => {
    const { rerender } = render(<AiSourceBadge source="RULES" model={null} />);
    expect(screen.getByText('Qoidalar rejimi')).toBeInTheDocument();
    rerender(<AiSourceBadge source="LLM" model="claude-sonnet-5" />);
    expect(screen.getByText('AI · claude-sonnet-5')).toBeInTheDocument();
  });
});
