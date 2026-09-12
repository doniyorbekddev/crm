import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { PASSWORD_RULES } from '@/lib/validation';

/** Yangi parol kiritilayotganda qaysi talablar bajarilganini ko‘rsatadi. */
export function PasswordRequirements({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Parol talablari">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(value);
        return (
          <li
            key={rule.label}
            className={cn('flex items-center gap-1.5 text-xs', passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg-muted')}
          >
            {passed ? <CheckCircle2 className="size-3.5 shrink-0" aria-hidden /> : <Circle className="size-3.5 shrink-0" aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{passed ? '— bajarildi' : '— bajarilmagan'}</span>
          </li>
        );
      })}
    </ul>
  );
}
