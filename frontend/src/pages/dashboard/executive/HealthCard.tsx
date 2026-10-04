import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import type { ExecutiveHealth, HealthStatus } from '@/types/dashboard';
import { ProgressBar } from '../parts';

const HEALTH_LABELS: Record<HealthStatus, string> = {
  GOOD: 'Yaxshi',
  FAIR: 'O‘rtacha',
  POOR: 'Xavfli',
  NO_DATA: 'Ma’lumot yetarli emas',
};

/** Ball chegaralari: ≥ 80 — yaxshi, ≥ 60 — o'rtacha, undan past — xavfli */
function scoreClasses(score: number | null): { ring: string; bar: string } {
  if (score === null) return { ring: 'text-fg-subtle', bar: 'bg-chart-neutral' };
  if (score >= 80) return { ring: 'text-chart-positive', bar: 'bg-chart-positive' };
  if (score >= 60) return { ring: 'text-chart-warning', bar: 'bg-chart-warning' };
  return { ring: 'text-chart-negative', bar: 'bg-chart-negative' };
}

/** Markaz sog'lomligi: umumiy ball (halqa) va tarkibiy qismlar */
export function HealthCard({ health }: { health: ExecutiveHealth }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = health.score === null ? 0 : (health.score / 100) * circumference;

  return (
    <Card className="h-full min-w-0">
      <CardHeader>
        <CardTitle>Markaz sog‘lomligi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto size-28 shrink-0 sm:mx-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={`Sog‘lomlik bahosi: ${health.score ?? 'ma’lumot yo‘q'}`}>
            <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-surface-muted" />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              stroke="currentColor"
              strokeDasharray={`${progress} ${circumference}`}
              className={scoreClasses(health.score).ring}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-h1 text-fg tabular-nums">{health.score ?? '—'}</span>
            <span className="text-caption text-fg-muted">{HEALTH_LABELS[health.status]}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2.5">
          {health.components.map((component) => (
            <li key={component.key} title={component.hint}>
              <div className="mb-1 flex items-center justify-between gap-2 text-caption">
                <span className="text-fg-muted">{component.label}</span>
                <span className="text-fg tabular-nums">
                  {component.value}
                  <span className="ml-1.5 text-fg-subtle">{component.score === null ? 'ma’lumot yo‘q' : `${component.score} ball`}</span>
                </span>
              </div>
              <ProgressBar size="sm" percent={component.score === null ? 0 : Math.max(component.score, 3)} className={cn(scoreClasses(component.score).bar)} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
