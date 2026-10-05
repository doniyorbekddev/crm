import { Controller } from 'react-hook-form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import type { CurrencyInputProps } from '@/components/ui/CurrencyInput';

type MoneyControllerProps<Values extends FieldValues> = Omit<CurrencyInputProps, 'value' | 'onValueChange' | 'name'> & {
  control: Control<Values>;
  name: FieldPath<Values>;
};

/**
 * Pul maydoni react-hook-form bilan: ekranda "1 500 000" ko'rinadi, formada esa avvalgidek **raqamlar satri**
 * ("1500000") saqlanadi — mavjud zod sxemalari va yuborish mantig'i o'zgarmaydi.
 */
export function MoneyController<Values extends FieldValues>({ control, name, ...props }: MoneyControllerProps<Values>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const digits = String(field.value ?? '').replace(/\D/g, '');
        return (
          <CurrencyInput
            {...props}
            ref={field.ref}
            name={field.name}
            value={digits === '' ? null : Number(digits)}
            onValueChange={(next) => field.onChange(next === null ? '' : String(next))}
            onBlur={field.onBlur}
          />
        );
      }}
    />
  );
}
