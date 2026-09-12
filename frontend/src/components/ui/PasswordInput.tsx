import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import type { InputProps } from '@/components/ui/Input';

export function PasswordInput(props: Omit<InputProps, 'type' | 'rightSlot'>) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Parolni yashirish' : 'Parolni ko‘rsatish'}
          className="grid size-8 place-items-center rounded-md text-fg-subtle outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      }
    />
  );
}
