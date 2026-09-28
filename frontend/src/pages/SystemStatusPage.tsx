import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage } from '@/lib/api';
import { appEnv } from '@/lib/env';
import { usePermission } from '@/hooks/usePermission';
import { healthService } from '@/services/health.service';
import { formatDateTime, formatDuration, formatTime } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const HEALTH_REFETCH_INTERVAL_MS = 15_000;

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-muted px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

/**
 * Fon vazifalari (TZ 3.1 §44): oxirgi muvaffaqiyatli va xato yurish. Xato muvaffaqiyatdan keyin bo'lsa — qizil.
 * Server qayta ishga tushgandan keyin birinchi yurishgacha ro'yxat bo'sh bo'lishi mumkin.
 */
function JobsCard() {
  const jobs = useQuery({ queryKey: ['health', 'jobs'], queryFn: healthService.jobs, refetchInterval: 60_000 });
  return (
    <Card className="mt-4">
      <CardHeader>
        <div>
          <CardTitle>Fon vazifalari</CardTitle>
          <CardDescription>Eslatmalar, navbat, takrorlanuvchi vazifalar, sandbox va boshqalar — oxirgi yurish</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : jobs.isError ? (
          <p className="text-sm text-fg-muted">{getErrorMessage(jobs.error)}</p>
        ) : jobs.data.length === 0 ? (
          <p className="text-sm text-fg-muted">Server yaqinda ishga tushgan — vazifalar hali yurmagan.</p>
        ) : (
          <ul className="divide-y divide-border">
            {jobs.data.map((job) => {
              const failing = job.lastFailureAt !== null && (job.lastSuccessAt === null || job.lastFailureAt > job.lastSuccessAt);
              return (
                <li key={job.job} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-mono text-xs">{job.job}</span>
                  <span className="flex items-center gap-2 text-xs text-fg-muted">
                    {job.lastSuccessAt ? `oxirgi: ${formatDateTime(job.lastSuccessAt)}` : 'hali muvaffaqiyatli emas'}
                    {failing ? <Badge tone="red">xato: {formatDateTime(job.lastFailureAt)}</Badge> : <Badge tone="green">ishlayapti</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemStatusPage() {
  const canSeeJobs = usePermission(PERMISSIONS.SETTINGS_MANAGE);
  const { data, error, isPending, isError, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: healthService.check,
    refetchInterval: HEALTH_REFETCH_INTERVAL_MS,
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Tizim holati"
        description="Backend API va ma’lumotlar bazasining joriy holati"
        actions={
          !isPending && !isError ? (
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching}
              leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
              onClick={() => void refetch()}
            >
              Yangilash
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
              <Server className="size-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <CardTitle>Backend API</CardTitle>
              <CardDescription className="truncate">{appEnv.apiUrl}</CardDescription>
            </div>
          </div>
          {isPending ? (
            <Skeleton className="h-5 w-24 rounded-full" />
          ) : isError ? (
            <Badge tone="red">Ulanmagan</Badge>
          ) : data.status === 'degraded' ? (
            <Badge tone="yellow">
              <AlertTriangle className="size-3.5" aria-hidden />
              Qisman ishlayapti
            </Badge>
          ) : (
            <Badge tone="green">
              <CheckCircle2 className="size-3.5" aria-hidden />
              Ishlayapti
            </Badge>
          )}
        </CardHeader>

        <CardContent>
          {isPending ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
                <AlertTriangle className="size-6" aria-hidden />
              </div>
              <div>
                <p className="font-medium">API bilan aloqa yo‘q</p>
                <p className="mt-1 text-sm text-fg-muted">{getErrorMessage(error)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={isFetching}
                leftIcon={<RefreshCw className="size-4" aria-hidden />}
                onClick={() => void refetch()}
              >
                Qayta tekshirish
              </Button>
            </div>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Servis" value={data.service} />
              <DetailItem
                label="Ma’lumotlar bazasi"
                value={
                  data.database === 'up' ? (
                    <Badge tone="green">PostgreSQL ulangan</Badge>
                  ) : (
                    <Badge tone="red">Ulanib bo‘lmadi</Badge>
                  )
                }
              />
              <DetailItem label="Muhit" value={data.environment} />
              <DetailItem label="Ishlash vaqti" value={formatDuration(data.uptimeSeconds)} />
              <DetailItem label="Server vaqti" value={formatDateTime(data.timestamp)} />
            </dl>
          )}
        </CardContent>
      </Card>

      {canSeeJobs && <JobsCard />}

      <p className="mt-3 text-xs text-fg-muted">
        {dataUpdatedAt > 0 ? `Oxirgi tekshiruv: ${formatTime(new Date(dataUpdatedAt))}` : 'Tekshirilmoqda...'} · har{' '}
        {HEALTH_REFETCH_INTERVAL_MS / 1000} soniyada yangilanadi
      </p>
    </div>
  );
}
