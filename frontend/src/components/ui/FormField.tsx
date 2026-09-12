import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  /** Label o‘ng tomonidagi element (masalan: "Parolni unutdingizmi?") */
  labelAction?: ReactNode;
  children: ReactNode;
}

/** Input xatoligi uchun id: `aria-describedby={fieldErrorId('email')}` */
export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

export function FormField({ label, htmlFor, error, hint, required = false, labelAction, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
