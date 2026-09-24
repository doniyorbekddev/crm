import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('matnni ko‘rsatadi', () => {
    render(<Badge>Faol</Badge>);
    expect(screen.getByText('Faol')).toBeInTheDocument();
  });

  it('ohangga qarab rang sinfini qo‘yadi', () => {
    render(<Badge tone="red">Qarzdor</Badge>);
    expect(screen.getByText('Qarzdor').className).toContain('red');
  });

  it('qo‘shimcha sinf berilgani saqlanadi', () => {
    render(<Badge className="ml-2">Yangi</Badge>);
    expect(screen.getByText('Yangi')).toHaveClass('ml-2');
  });
});
