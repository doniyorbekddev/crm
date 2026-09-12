import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { LeadPriority, LeadStatus } from '@/types/lead';
import {
  LEAD_PRIORITY_LABELS,
  LEAD_PRIORITY_TONES,
  LEAD_STATUS_DOTS,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
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
