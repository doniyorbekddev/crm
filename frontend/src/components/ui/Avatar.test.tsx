import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { centerSquare } from '@/utils/avatarImage';
import { Avatar, avatarSrc } from './Avatar';

describe('Avatar', () => {
  it('rasm bo‘lmasa bosh harflar; rasm bo‘lsa <img>, yuklanmasa yana bosh harflar', () => {
    const { container, rerender } = render(<Avatar firstName="Ali" lastName="Valiyev" />);
    expect(container.textContent).toBe('AV');
    expect(container.querySelector('img')).toBeNull();

    rerender(<Avatar firstName="Ali" lastName="Valiyev" src="/public/avatars/2026/10/a.jpg" />);
    const image = container.querySelector('img')!;
    expect(image.getAttribute('src')).toMatch(/\/public\/avatars\/2026\/10\/a\.jpg$/);
    expect(container.textContent).toBe('');

    fireEvent.error(image);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('AV');

    // Yangi rasm (boshqa manzil) — qayta uriniladi
    rerender(<Avatar firstName="Ali" lastName="Valiyev" src="/public/avatars/2026/10/b.jpg" />);
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('manzil: nisbiy yo‘lga API bazasi qo‘shiladi, to‘liq manzil o‘zgarmaydi', () => {
    expect(avatarSrc(null)).toBeNull();
    expect(avatarSrc('/public/avatars/x.jpg')).toMatch(/\/public\/avatars\/x\.jpg$/);
    expect(avatarSrc('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
    expect(avatarSrc('blob:abc')).toBe('blob:abc');
  });

  it('kvadrat qirqim markazdan olinadi', () => {
    expect(centerSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(centerSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
    expect(centerSquare(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});
