import { Badge } from '@/components/ui/Badge';
import type { StaffDay } from '@/types/staffAttendance';
import { STAFF_STATUS_LABELS, STAFF_STATUS_TONES } from '@/utils/staffAttendanceLabels';

/** Kun holati + (kerak bo'lsa) kechikish/erta ketish daqiqalari */
export function StaffStatusBadge({ day }: { day: Pick<StaffDay, 'status' | 'arrival' | 'lateMinutes' | 'earlyMinutes' | 'corrected'> }) {
  const extra =
    day.status === 'WORKING' || day.status === 'ON_BREAK' || day.status === 'COMPLETED'
      ? day.arrival === 'LATE'
        ? `${day.lateMinutes} daq kechikdi`
        : null
      : day.status === 'LATE'
        ? `${day.lateMinutes} daq`
        : day.status === 'EARLY_DEPARTURE'
          ? `${day.earlyMinutes} daq erta`
          : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={STAFF_STATUS_TONES[day.status]} dot>
        {STAFF_STATUS_LABELS[day.status]}
      </Badge>
      {extra && <span className="text-caption text-fg-subtle">{extra}</span>}
      {day.corrected && (
        <Badge tone="neutral" title="Rahbar tuzatgan">
          tuzatilgan
        </Badge>
      )}
    </span>
  );
}

/** "09:00 – 18:00", darslar bo'yicha yoki dam olish */
export function planText(day: Pick<StaffDay, 'planKind' | 'planSource' | 'planNote' | 'scheduledStart' | 'scheduledEnd'>): string {
  if (day.planKind === 'HOLIDAY') return `Bayram${day.planNote ? `: ${day.planNote}` : ''}`;
  if (day.planKind === 'UNSCHEDULED') return 'Jadval belgilanmagan';
  if (day.planKind === 'OFF') return day.planSource === 'LESSONS' ? 'Dars yo‘q' : 'Dam olish kuni';
  const range = `${day.scheduledStart} – ${day.scheduledEnd}`;
  if (day.planSource === 'LESSONS') return `${range} (darslar)`;
  if (day.planSource === 'EXCEPTION') return `${range} (o‘zgartirilgan)`;
  return range;
}
