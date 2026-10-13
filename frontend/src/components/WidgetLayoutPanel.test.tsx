import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WidgetLayoutPanel } from './WidgetLayoutPanel';

const widgets = [
  { key: 'kpis', label: 'Asosiy ko‘rsatkichlar', span: 'full', visible: true },
  { key: 'charts', label: 'Grafiklar', span: 'twoThirds', visible: true },
  { key: 'tasks', label: 'Bugungi vazifalar', span: 'third', visible: false },
] as const;

describe('WidgetLayoutPanel', () => {
  it('tartib tugmalari nomlangan; chetdagilari o‘chirilgan; bosilganda yangi tartib beriladi', async () => {
    const onChange = vi.fn();
    render(<WidgetLayoutPanel widgets={widgets} onChange={onChange} onReset={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Asosiy ko‘rsatkichlar — yuqoriga' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bugungi vazifalar — pastga' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Grafiklar — yuqoriga' }));
    expect(onChange).toHaveBeenLastCalledWith({ order: ['charts', 'kpis', 'tasks'], hidden: ['tasks'] });

    await userEvent.click(screen.getByRole('button', { name: 'Grafiklar — pastga' }));
    expect(onChange).toHaveBeenLastCalledWith({ order: ['kpis', 'tasks', 'charts'], hidden: ['tasks'] });
  });

  it('belgilash katagi vidjetni yashiradi yoki ko‘rsatadi; "Standart holat" qaytaradi', async () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(<WidgetLayoutPanel widgets={widgets} onChange={onChange} onReset={onReset} />);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Grafiklar' }));
    expect(onChange).toHaveBeenLastCalledWith({ order: ['kpis', 'charts', 'tasks'], hidden: ['tasks', 'charts'] });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Bugungi vazifalar' }));
    expect(onChange).toHaveBeenLastCalledWith({ order: ['kpis', 'charts', 'tasks'], hidden: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Standart holat' }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
