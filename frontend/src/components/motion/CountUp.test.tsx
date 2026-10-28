import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountUp, parseFormattedNumber } from './CountUp';

describe('parseFormattedNumber', () => {
  it('ming ajratgich, ishora, kasr va qo‘shimcha saqlanadi', () => {
    const money = parseFormattedNumber('-650 000 so‘m')!;
    expect(money.value).toBe(-650000);
    expect(money.format(0)).toBe('0 so‘m');
    expect(money.format(-1234.4)).toBe('-1 234 so‘m');
    expect(money.format(-650000)).toBe('-650 000 so‘m');

    expect(parseFormattedNumber('75%')!.format(37.6)).toBe('38%');
    expect(parseFormattedNumber('4,5 ball')!.format(2.25)).toBe('2,3 ball');
    expect(parseFormattedNumber('Shu oyda: 39')!.format(39)).toBe('Shu oyda: 39');
    expect(parseFormattedNumber('400 000')!.format(400000)).toBe('400 000');
    expect(parseFormattedNumber('—')).toBeNull();
  });
});

describe('CountUp', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('IntersectionObserver bo‘lmasa (yoki reduced-motion) — darhol yakuniy qiymat, bitta matn', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<CountUp text="400 000 so‘m" />);
    expect(screen.getByText('400 000 so‘m')).toBeInTheDocument();
  });

  it('animatsiya paytida ham yakuniy qiymat bitta matn tugunida (sr-only), sanash — bezak atributida', () => {
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe;
        disconnect = vi.fn();
        unobserve = vi.fn();
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = render(<CountUp text="16" />);
    expect(screen.getAllByText('16')).toHaveLength(1);
    expect(container.querySelector('.count-up')).toHaveAttribute('data-count', '0');
    expect(observe).toHaveBeenCalled();
  });
});
