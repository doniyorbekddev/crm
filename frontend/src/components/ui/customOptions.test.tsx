import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { CustomizableSelect } from './CustomizableSelect';
import { SuggestInput } from './SuggestInput';

type Relation = 'MOTHER' | 'FATHER' | 'OTHER';
const LABELS: Record<Relation, string> = { MOTHER: 'Onasi', FATHER: 'Otasi', OTHER: 'Boshqa' };

function RelationPicker({ initial = { code: 'MOTHER' as Relation, label: null as string | null }, suggestions = [] as string[] }) {
  const [choice, setChoice] = useState(initial);
  return (
    <>
      <CustomizableSelect
        aria-label="Qarindoshlik"
        order={['MOTHER', 'FATHER', 'OTHER'] as const}
        labels={LABELS}
        otherCode="OTHER"
        code={choice.code}
        customLabel={choice.label}
        suggestions={suggestions}
        onChange={(code, label) => setChoice({ code, label })}
      />
      <p data-testid="choice">{`${choice.code}:${choice.label ?? '-'}`}</p>
      <button type="button">keyingi</button>
    </>
  );
}

describe('CustomizableSelect', () => {
  it('tizim qiymatlari, markaz nomlari va "Boshqa" oxirida; o‘z nomi "Boshqa" kodiga bog‘lanadi', async () => {
    render(<RelationPicker suggestions={['Buvi', 'onasi']} />);
    const input = screen.getByRole('combobox', { name: 'Qarindoshlik' });
    expect(input).toHaveValue('Onasi');

    await userEvent.click(input);
    // "onasi" tizim yorlig'i bilan bir xil — alohida band bo'lmaydi
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Onasi',
      'Otasi',
      'BuviMarkazda qo‘shilgan',
      'Boshqa',
    ]);

    await userEvent.click(screen.getByRole('option', { name: /Buvi/ }));
    expect(screen.getByTestId('choice')).toHaveTextContent('OTHER:Buvi');
    expect(input).toHaveValue('Buvi');

    await userEvent.click(input);
    await userEvent.click(screen.getByRole('option', { name: 'Otasi' }));
    expect(screen.getByTestId('choice')).toHaveTextContent('FATHER:-');
  });

  it('yangi nom: Enter bilan yoki maydondan chiqqanda (Tab) qabul qilinadi', async () => {
    render(<RelationPicker />);
    const input = screen.getByRole('combobox', { name: 'Qarindoshlik' });
    await userEvent.click(input);
    await userEvent.type(input, ' Tog‘a ');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('choice')).toHaveTextContent('OTHER:Tog‘a');
    expect(input).toHaveValue('Tog‘a');

    await userEvent.click(input);
    await userEvent.type(input, 'Aka');
    await userEvent.tab();
    expect(await screen.findByTestId('choice')).toHaveTextContent('OTHER:Aka');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('tizimdagi nom yozilsa yangi qo‘shilmaydi — mavjudini tanlash kerak', async () => {
    render(<RelationPicker />);
    const input = screen.getByRole('combobox', { name: 'Qarindoshlik' });
    await userEvent.click(input);
    await userEvent.type(input, 'otasi');
    expect(screen.queryByRole('option', { name: /o‘zim qo‘shaman/ })).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByTestId('choice')).toHaveTextContent('MOTHER:-');
  });
});

function Department() {
  const [value, setValue] = useState('');
  return (
    <>
      <SuggestInput aria-label="Bo‘lim" value={value} onChange={setValue} suggestions={['Sotuv', 'O‘quv bo‘limi']} />
      <p data-testid="value">{value || '-'}</p>
      <button type="button">keyingi</button>
    </>
  );
}

describe('SuggestInput', () => {
  it('taklifdan tanlash, yangi qiymatni Tab bilan saqlash va tozalash', async () => {
    render(<Department />);
    const input = screen.getByRole('combobox', { name: 'Bo‘lim' });
    await userEvent.click(input);
    await userEvent.type(input, 'sot');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('value')).toHaveTextContent('Sotuv');

    await userEvent.click(input);
    await userEvent.type(input, 'Buxgalteriya');
    await userEvent.tab();
    expect(await screen.findByTestId('value')).toHaveTextContent('Buxgalteriya');
    expect(input).toHaveValue('Buxgalteriya');

    await userEvent.click(screen.getByRole('button', { name: 'Tanlovni tozalash' }));
    expect(screen.getByTestId('value')).toHaveTextContent('-');
  });
});
