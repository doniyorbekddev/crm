import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, CalendarDays, FileCheck, HeartPulse, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import type { RiskLevel } from '@/types/student';
import { formatDate, formatDateTime, formatRelativeTime } from '@/utils/format';

/**
 * O'quvchiga risk **yumshoq** so'z bilan ko'rsatiladi — "kritik" emas, "yordam kerak".
 * Sabablar backenddan keladi (eng past balli omillar), ball ko'rsatilmaydi.
 */
const RISK_VIEW: Record<RiskLevel, { label: string; className: string }> = {
  HEALTHY: { label: 'Hammasi yaxshi', className: 'text-emerald-600 dark:text-emerald-400' },
  ATTENTION: { label: 'E’tibor kerak', className: 'text-amber-600 dark:text-amber-400' },
  AT_RISK: { label: 'Yordam kerak', className: 'text-orange-600 dark:text-orange-400' },
  CRITICAL: { label: 'Yordam kerak', className: 'text-red-600 dark:text-red-400' },
};

function InfoCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  valueClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string | null;
  to?: string;
  valueClassName?: string;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className={cn('mt-1 truncate text-base font-semibold text-fg', valueClassName)}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-fg-subtle">{hint}</p>}
    </>
  );
  const className = 'block min-w-0 rounded-xl border border-border bg-surface p-4';
  return to ? (
    <Link to={to} className={cn(className, 'transition-colors hover:bg-surface-muted/60 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Bosh sahifadagi "bugun nima muhim" qatori: dars, vazifa, imtihon, progress, holat */
export function OverviewCards({ studentId }: { studentId: string }) {
  const query = useQuery({ queryKey: queryKeys.portal.overview(studentId), queryFn: () => portalService.overview(studentId) });

  if (query.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  // Bosh sahifa qolgan qismi baribir ishlaydi — bu blok xato bo'lsa jim o'tkaziladi
  if (query.isError) return null;

  const { nextLesson, pendingHomework, nextExam, courseProgress, risk } = query.data;
  const riskView = risk ? RISK_VIEW[risk.level] : null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <InfoCard
        icon={CalendarDays}
        label="Keyingi dars"
        value={nextLesson ? `${formatDate(nextLesson.date)} · ${nextLesson.startTime}` : 'Rejalashtirilmagan'}
        hint={nextLesson ? (nextLesson.topic ?? nextLesson.room ?? null) : null}
      />
      <InfoCard
        icon={BookOpenCheck}
        label="Kutilayotgan vazifa"
        value={pendingHomework.count === 0 ? 'Yo‘q' : `${pendingHomework.count} ta`}
        hint={pendingHomework.next ? `${pendingHomework.next.title} · ${formatRelativeTime(pendingHomework.next.deadline)}` : null}
        to={pendingHomework.next ? `/portal/homework/${pendingHomework.next.homeworkId}` : '/portal/homework'}
      />
      <InfoCard
        icon={FileCheck}
        label="Keyingi imtihon"
        value={nextExam ? formatDate(nextExam.date) : 'Rejalashtirilmagan'}
        hint={nextExam?.title ?? null}
        to={nextExam ? `/portal/exams/${nextExam.examId}` : '/portal/exams'}
      />
      <InfoCard
        icon={TrendingUp}
        label="Kurs progressi"
        value={courseProgress === null ? '—' : `${courseProgress}%`}
        hint={courseProgress === null ? 'Dastur tuzilmagan' : 'o‘tilgan mavzular'}
      />
      <InfoCard
        icon={HeartPulse}
        label="Holat"
        value={riskView ? riskView.label : 'Hisoblanmoqda'}
        hint={risk && risk.reasons.length > 0 ? risk.reasons.join(' · ') : null}
        valueClassName={riskView?.className}
      />
      {nextExam && <span className="sr-only">{formatDateTime(nextExam.date)}</span>}
    </div>
  );
}
