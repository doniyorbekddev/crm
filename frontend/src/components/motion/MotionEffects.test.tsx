import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionEffects } from './MotionEffects';

function rect(top: number) {
  return () => ({ top, bottom: top + 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
}

describe('MotionEffects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-reveal-ready');
    document.body.innerHTML = '';
  });

  it('ekrandagi element yashirilmaydi; ekrandan tashqaridagisi kirguncha kutadi', () => {
    const observed: Element[] = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = (element: Element) => observed.push(element);
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    const visible = document.createElement('div');
    visible.setAttribute('data-reveal', '');
    visible.getBoundingClientRect = rect(10);
    const below = document.createElement('div');
    below.setAttribute('data-reveal', 'stagger');
    below.append(document.createElement('p'), document.createElement('p'));
    below.getBoundingClientRect = rect(5000);
    document.body.append(visible, below);

    render(<MotionEffects />);
    expect(document.documentElement).toHaveAttribute('data-reveal-ready');
    expect(visible).not.toHaveAttribute('data-reveal-pending');
    expect(below).toHaveAttribute('data-reveal-pending');
    expect((below.children[1] as HTMLElement).style.getPropertyValue('--reveal-index')).toBe('1');
    expect(observed).toEqual([below]);
  });

  it('reduced-motion: hech narsa yashirilmaydi', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const below = document.createElement('div');
    below.setAttribute('data-reveal', '');
    below.getBoundingClientRect = rect(5000);
    document.body.append(below);
    render(<MotionEffects />);
    expect(document.documentElement).not.toHaveAttribute('data-reveal-ready');
    expect(below).not.toHaveAttribute('data-reveal-pending');
  });
});
