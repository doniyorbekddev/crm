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
    // Ranglar semantik tokenlardan (dizayn tizimi PHASE 1): "red" → danger
    expect(screen.getByText('Qarzdor')).toHaveClass('bg-danger-subtle', 'text-danger');
    render(<Badge tone="success">To‘langan</Badge>);
    expect(screen.getByText('To‘langan')).toHaveClass('bg-success-subtle', 'text-success');
  });

  it('qo‘shimcha sinf berilgani saqlanadi', () => {
    render(<Badge className="ml-2">Yangi</Badge>);
    expect(screen.getByText('Yangi')).toHaveClass('ml-2');
  });
});
