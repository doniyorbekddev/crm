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
        <label htmlFor={htmlFor} className="text-label text-fg">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-caption text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
