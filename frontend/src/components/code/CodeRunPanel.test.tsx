import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CodeRun } from '@/types/codeRun';
import { CodeRunPanel } from './CodeRunPanel';
import { HtmlPreview, buildPreviewDocument } from './HtmlPreview';

const run: CodeRun = {
  id: 'r1',
  status: 'FAILED',
  language: 'python',
  passed: 1,
  total: 2,
  error: null,
  createdAt: '2026-09-27T10:00:00.000Z',
  finishedAt: '2026-09-27T10:00:02.000Z',
  tests: [
    { index: 1, passed: true, status: 'ok', timeMs: 120, hidden: false, input: '2 3', expected: '5', stdout: '5\n', stderr: '' },
    { index: 2, passed: false, status: 'timeout', timeMs: 5000, hidden: true, input: null, expected: null, stdout: null, stderr: null },
  ],
};

describe('CodeRunPanel (GAP-19)', () => {
  it('sandbox ulanmagan va natija yo‘q — buni aniq aytadi (soxta “o‘tdi” yo‘q)', () => {
    render(<CodeRunPanel run={null} enabled={false} hasTests />);
    expect(screen.getByText(/sandbox .* hali ulanmagan/)).toBeInTheDocument();
    expect(screen.queryByText(/o‘tdi/)).toBeNull();
  });

  it('testlar yo‘q — hech narsa ko‘rsatmaydi', () => {
    const { container } = render(<CodeRunPanel run={null} enabled hasTests={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('natija: holat, x/y, sabab; yashirin test kirish/chiqishsiz; qayta tekshirish', async () => {
    const onRerun = vi.fn();
    render(<CodeRunPanel run={run} enabled hasTests onRerun={onRerun} />);
    expect(screen.getByText('Testlar o‘tmadi')).toBeInTheDocument();
    expect(screen.getByText('1/2 test')).toBeInTheDocument();
    expect(screen.getByText(/Test 2: o‘tmadi \(vaqt tugadi\)/)).toBeInTheDocument();
    expect(screen.getByText('yashirin')).toBeInTheDocument();
    expect(screen.getAllByText(/kirish:/)).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole('button', { name: /Qayta tekshirish/ }));
    expect(onRerun).toHaveBeenCalled();
  });
});

describe('HtmlPreview (GAP-19)', () => {
  it('iframe: allow-scripts, allow-same-origin YO‘Q; CSP tarmoqni yopadi', () => {
    render(<HtmlPreview code="<h1>Salom</h1><script>fetch('https://x')</script>" />);
    const frame = screen.getByTitle('HTML ko‘rinishi');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    const doc = buildPreviewDocument('<p>x</p>');
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toMatch(/connect-src/);
  });
});
