import { Bot, Lightbulb, ListChecks, Search, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { Insight, InsightType } from '@/types/aiAcademic';

const META: Record<InsightType, { label: string; icon: LucideIcon; chip: string; hint: string }> = {
  FACT: { label: 'Fakt', icon: ListChecks, chip: 'bg-surface-muted text-fg-muted', hint: 'CRM ma’lumoti' },
  OBSERVATION: { label: 'Kuzatuv', icon: Search, chip: 'bg-warning-subtle text-warning', hint: 'tahlil xulosasi' },
  RECOMMENDATION: { label: 'Tavsiya', icon: Lightbulb, chip: 'bg-primary-subtle text-primary', hint: 'keyingi qadam' },
};

/**
 * TZ §60: fakt, kuzatuv va tavsiya alohida bloklarda — o'qituvchi CRM raqami va AI xulosasini
 * farqlay oladi ("nima bo'ldi → nega → nima qilish kerak"). Faktlar har doim CRM'dan (kod bilan) olinadi.
 */
export function InsightList({ items }: { items: Insight[] }) {
  return (
    <div className="space-y-2">
      {(['FACT', 'OBSERVATION', 'RECOMMENDATION'] as const).map((type) => {
        const rows = items.filter((item) => item.type === type);
        if (rows.length === 0) return null;
        const { label, icon: Icon, chip, hint } = META[type];
        return (
          <section key={type} aria-label={label} className="rounded-control border border-border bg-surface p-3">
            <h4 className="mb-1.5 flex items-center gap-2 text-caption text-fg-muted">
              <span className={cn('grid size-6 place-items-center rounded-chip', chip)}>
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="text-h4 text-fg">{label}</span>
              <span aria-hidden>· {hint}</span>
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-body text-fg marker:text-fg-subtle">
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
    <Badge tone={source === 'LLM' ? 'accent' : 'neutral'} title={source === 'LLM' ? 'Til modeli yaratgan matn — o‘qituvchi tekshiradi' : 'CRM ma’lumotidan qoidalar bilan hisoblangan'}>
      {source === 'LLM' ? <Sparkles className="size-3" aria-hidden /> : <Bot className="size-3" aria-hidden />}
      {source === 'LLM' ? `AI${model ? ` · ${model}` : ''}` : 'Qoidalar rejimi'}
    </Badge>
  );
}
