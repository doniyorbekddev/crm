import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { getFieldErrors } from '@/lib/api';

/**
 * Server qaytargan maydon xatolarini (masalan: "email band") formadagi tegishli maydonlarga yozadi.
 * Kamida bitta maydonga yozilgan bo‘lsa `true` qaytaradi.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  let applied = false;
  for (const detail of getFieldErrors(error)) {
    const field = fields.find((name) => name === detail.field);
    if (field) {
      setError(field, { type: 'server', message: detail.message });
      applied = true;
    }
  }
  return applied;
}
