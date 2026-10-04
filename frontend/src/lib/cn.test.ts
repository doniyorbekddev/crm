import { describe, expect, it } from 'vitest';
import { cn } from './cn';

/** Dizayn tokenlari tailwind-merge bilan to'g'ri birlashadi (PHASE 1) */
describe('cn — dizayn tokenlari', () => {
  it('tipografiya tokeni rang bilan to‘qnashmaydi, boshqa o‘lchamni almashtiradi', () => {
    expect(cn('text-h1 text-fg')).toBe('text-h1 text-fg');
    expect(cn('text-sm', 'text-h2')).toBe('text-h2');
    expect(cn('text-body text-danger')).toBe('text-body text-danger');
  });

  it('radius, qatlam va davomiylik tokenlari o‘z guruhida almashadi', () => {
    expect(cn('rounded-lg', 'rounded-card')).toBe('rounded-card');
    expect(cn('z-50', 'z-modal')).toBe('z-modal');
    expect(cn('duration-200', 'duration-fast')).toBe('duration-fast');
  });

  it('semantik ranglar oddiy rang kabi almashadi', () => {
    expect(cn('bg-surface', 'bg-danger-subtle')).toBe('bg-danger-subtle');
    expect(cn('text-fg-muted', 'text-success')).toBe('text-success');
  });
});
