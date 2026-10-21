import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { dataQualityService } from '@/services/dataQuality.service';
import type { DataQualityCheck, DataQualitySeverity } from '@/types/dataQuality';
import { formatDateTime, formatNumber } from '@/utils/format';

const SEVERITY_LABELS: Record<DataQualitySeverity, string> = { HIGH: 'Muhim', MEDIUM: 'O‘rtacha', LOW: 'Past' };
const SEVERITY_TONES: Record<DataQualitySeverity, BadgeTone> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral' };

function CheckCard({ check }: { check: DataQualityCheck }) {
  const clean = check.count === 0;
  return (
    <Card className={cn('p-4', clean && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
            {check.label}
            {!clean && <Badge tone={SEVERITY_TONES[check.severity]}>{SEVERITY_LABELS[check.severity]}</Badge>}
          </p>
          <p className="text-caption text-fg-muted">{check.impact}</p>
        </div>
        {clean ? (
          <span className="inline-flex items-center gap-1.5 text-body text-success">
            <CircleCheck className="size-4" aria-hidden />
            Hammasi joyida
          </span>
        ) : (
          <span className="text-h2 text-fg tabular-nums">{formatNumber(check.count)}</span>
        )}
      </div>
      {!clean && (
        <>
          {check.sample.length > 0 && (
            <details className="mt-3 rounded-control border border-border">
              <summary className="focus-ring cursor-pointer rounded-control px-3 py-2 text-caption text-fg-muted hover:text-fg">
                Ro‘yxat ({formatNumber(check.sample.length)}
                {check.count > check.sample.length ? ` / ${formatNumber(check.count)}` : ''})
              </summary>
              <ul className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
                {check.sample.map((item) => (
                  <li key={item.id}>
                    <Link to={item.to} className="flex items-center justify-between gap-3 px-3 py-2 text-body hover:bg-surface-muted">
                      <span className="min-w-0 truncate text-fg">{item.title}</span>
                      {item.subtitle && <span className="shrink-0 text-caption text-fg-muted tabular-nums">{item.subtitle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {check.action && (
            <Link to={check.action.to} className="mt-3 inline-flex items-center gap-1 text-body font-medium text-primary hover:underline">
              {check.action.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Ma'lumotlar sifati: CRM imkoniyatlari to'liq ishlashiga xalaqit beradigan bo'sh yoki nomuvofiq yozuvlar.
 * Faqat ko'rsatadi — tuzatish tegishli sahifada (havola) qilinadi.
 */
export default function DataQualityPage() {
  const query = useQuery({ queryKey: ['data-quality'], queryFn: dataQualityService.report, refetchOnWindowFocus: true });
  const data = query.data;
  const issues = data?.checks.filter((check) => check.count > 0).length ?? 0;

  return (
    <>
      <PageHeader
        title="Ma’lumotlar sifati"
        description={
          data
            ? `${formatNumber(data.activeStudents)} ta faol o‘quvchi · ${issues === 0 ? 'muammo topilmadi' : `${formatNumber(issues)} ta yo‘nalishda e’tibor kerak`} · ${formatDateTime(data.generatedAt)}`
            : 'Xabarlar, davomat va to‘lov hisoblari to‘g‘ri ishlashi uchun to‘ldirilishi kerak bo‘lgan ma’lumotlar'
        }
      />
      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data!.checks.map((check) => (
            <CheckCard key={check.key} check={check} />
          ))}
        </div>
      )}
      <p className="mt-4 inline-flex items-center gap-1.5 text-caption text-fg-subtle">
        <ClipboardCheck className="size-3.5" aria-hidden />
        Bu sahifa hech narsani o‘zgartirmaydi — har bir yozuv o‘z sahifasida tuzatiladi.
      </p>
    </>
  );
}
