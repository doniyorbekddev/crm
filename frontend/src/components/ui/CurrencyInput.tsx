import { cn } from '@/lib/cn';
import { Input } from './Input';
import type { InputProps } from './Input';

export interface CurrencyInputProps extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'rightSlot' | 'inputMode'> {
  /** Butun so'm (tiyinsiz). Bo'sh maydon — `null` */
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Maydon oxiridagi birlik */
  suffix?: string;
  /** Kiritish mumkin bo'lgan eng katta summa */
  max?: number;
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/**
 * Pul summasi: yozish paytida xonalarga ajratiladi ("1 500 000"), qiymat esa **son** bo'lib qaytadi.
 * react-hook-form bilan: `<Controller render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} />} />`.
 * Validatsiya (majburiy, minimal summa) — formaning zod sxemasida qoladi.
 */
export function CurrencyInput({ value, onValueChange, suffix = 'so‘m', max = 999_999_999_999, className, ...props }: CurrencyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value === null || Number.isNaN(value) ? '' : group(String(Math.trunc(value)))}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '');
        onValueChange(digits === '' ? null : Math.min(Number(digits), max));
      }}
      rightSlot={<span className="pointer-events-none pr-1.5 text-caption text-fg-subtle">{suffix}</span>}
      className={cn('pr-14 tabular-nums', className)}
    />
  );
}
