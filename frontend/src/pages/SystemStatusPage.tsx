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
import { healthService } from '@/services/health.service';
import { formatDateTime, formatDuration, formatTime } from '@/utils/format';

const HEALTH_REFETCH_INTERVAL_MS = 15_000;

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-muted px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
    </div>
  );
}

export default function SystemStatusPage() {
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

      <p className="mt-3 text-xs text-fg-muted">
        {dataUpdatedAt > 0 ? `Oxirgi tekshiruv: ${formatTime(new Date(dataUpdatedAt))}` : 'Tekshirilmoqda...'} · har{' '}
        {HEALTH_REFETCH_INTERVAL_MS / 1000} soniyada yangilanadi
      </p>
    </div>
  );
}
