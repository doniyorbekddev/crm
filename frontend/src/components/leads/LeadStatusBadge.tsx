import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { LeadPriority, LeadStatus, LeadTemperature } from '@/types/lead';
import {
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_TONES,
  LEAD_STATUS_DOTS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  LEAD_TEMPERATURE_HINTS,
  LEAD_TEMPERATURE_LABELS,
  LEAD_TEMPERATURE_TONES,
} from '@/utils/leadLabels';

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge tone={LEAD_STATUS_TONES[status]}>
      <span className={cn('size-1.5 rounded-full', LEAD_STATUS_DOTS[status])} aria-hidden />
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}

export function LeadPriorityBadge({ priority }: { priority: LeadPriority }) {
  return <Badge tone={LEAD_PRIORITY_TONES[priority]}>{LEAD_PRIORITY_LABELS[priority]}</Badge>;
}

/**
 * Lead qizish darajasi. Ball hali hisoblanmagan bo'lsa (yangi lead, fon vazifasi
 * navbatda) chizmani bo'sh qoldirmaslik uchun chiziqcha ko'rsatiladi.
 */
export function LeadTemperatureBadge({
  temperature,
  score,
}: {
  temperature: LeadTemperature | null;
  score?: number | null;
}) {
  if (temperature === null) return <span className="text-xs text-fg-subtle">—</span>;
  return (
    <Badge tone={LEAD_TEMPERATURE_TONES[temperature]} title={`${LEAD_TEMPERATURE_LABELS[temperature]} · ${LEAD_TEMPERATURE_HINTS[temperature]}`}>
      {LEAD_TEMPERATURE_LABELS[temperature]}
      {typeof score === 'number' && <span className="tabular-nums opacity-70">{score}</span>}
    </Badge>
  );
}
