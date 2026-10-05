import { Tooltip } from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/cn';
import type { LeadPriority, LeadStatus, LeadTemperature } from '@/types/lead';
import {
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
  return <StatusBadge kind="leadPriority" status={priority} />;
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
    <Tooltip content={LEAD_TEMPERATURE_HINTS[temperature]} describe={false}>
      <Badge tone={LEAD_TEMPERATURE_TONES[temperature]}>
        {LEAD_TEMPERATURE_LABELS[temperature]}
        {typeof score === 'number' && <span className="tabular-nums opacity-70">{score}</span>}
        <span className="sr-only"> — {LEAD_TEMPERATURE_HINTS[temperature]}</span>
      </Badge>
    </Tooltip>
  );
}
