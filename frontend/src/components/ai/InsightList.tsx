import { Bot, Lightbulb, ListChecks, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { Insight, InsightType } from '@/types/aiAcademic';

const META: Record<InsightType, { label: string; icon: LucideIcon; className: string }> = {
  FACT: { label: 'Fakt', icon: ListChecks, className: 'text-fg' },
  OBSERVATION: { label: 'Kuzatuv', icon: Search, className: 'text-amber-700 dark:text-amber-300' },
  RECOMMENDATION: { label: 'Tavsiya', icon: Lightbulb, className: 'text-brand-700 dark:text-brand-300' },
};

/**
 * TZ §60: fakt, kuzatuv va tavsiya alohida ko'rsatiladi — o'qituvchi CRM raqami va AI xulosasini
 * farqlay oladi. Faktlar har doim CRM'dan (kod bilan) olinadi.
 */
export function InsightList({ items }: { items: Insight[] }) {
  return (
    <div className="space-y-3">
      {(['FACT', 'OBSERVATION', 'RECOMMENDATION'] as const).map((type) => {
        const rows = items.filter((item) => item.type === type);
        if (rows.length === 0) return null;
        const { label, icon: Icon, className } = META[type];
        return (
          <section key={type} aria-label={label}>
            <h4 className={cn('mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide', className)}>
              <Icon className="size-3.5" aria-hidden /> {label}
            </h4>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-fg">
              {rows.map((row, index) => (
                <li key={index}>{row.text}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Tahlil manbasi: qoidalar yoki model (qaysi model) */
export function AiSourceBadge({ source, model }: { source: 'RULES' | 'LLM'; model: string | null }) {
  return (
    <Badge tone={source === 'LLM' ? 'purple' : 'gray'}>
      <Bot className="mr-1 inline size-3" aria-hidden />
      {source === 'LLM' ? `AI${model ? ` · ${model}` : ''}` : 'Qoidalar rejimi'}
    </Badge>
  );
}
