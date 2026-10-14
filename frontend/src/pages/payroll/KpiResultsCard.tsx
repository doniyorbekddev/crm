import { useMutation } from '@tanstack/react-query';
import { PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { salaryService } from '@/services/salary.service';
import type { KpiEvaluation, KpiResult } from '@/types/payroll';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { formatKpiValue } from './payrollUtils';

interface KpiResultsCardProps {
  evaluation: KpiEvaluation;
  /** true — maoshga yozilgan nusxa; false — jonli (hali hisoblanmagan) */
  snapshot: boolean;
  employeeId: string;
  year: number;
  month: number;
  canEnterManual: boolean;
  onChanged: () => void;
}

function achievementTone(value: number | null): string {
  if (value === null) return 'bg-surface-muted';
  if (value >= 100) return 'bg-chart-positive';
  if (value >= 70) return 'bg-chart-brand';
  if (value >= 50) return 'bg-chart-warning';
  return 'bg-chart-negative';
}

/** KPI natijalari: maqsad, natija, bajarilish va vazn — har biri manba yozuvlariga asoslangan */
export function KpiResultsCard({ evaluation, snapshot, employeeId, year, month, canEnterManual, onChanged }: KpiResultsCardProps) {
  const [manual, setManual] = useState<KpiResult | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>KPI natijalari</CardTitle>
        <Badge tone={snapshot ? 'neutral' : 'info'}>{snapshot ? 'Hisoblangan paytdagi' : 'Jonli hisob'}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {evaluation.results.length === 0 ? (
          <p className="text-body text-fg-muted">
            Lavozimga KPI belgilanmagan.{' '}
            <Link to="/salaries/kpi" className="text-primary hover:underline">
              KPI sozlamalari
            </Link>
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Vaznli bajarilish" value={evaluation.achievement === null ? '—' : `${formatNumber(evaluation.achievement)}%`} />
              <Metric label="Chegara" value={`${formatNumber(evaluation.threshold)}%`} />
              <Metric label="Bonus fondi" value={formatMoney(evaluation.pool)} />
              <Metric label="KPI bonusi" value={formatMoney(evaluation.bonus)} tone={evaluation.bonus > 0 ? 'success' : 'default'} />
            </div>
            {!evaluation.configValid && (
              <Alert tone="warning">
                Lavozim KPI vaznlari yig‘indisi {formatNumber(evaluation.weightSum)}% — 100% bo‘lmaguncha bonus hisoblanmaydi.
              </Alert>
            )}
            <ul className="divide-y divide-border">
              {evaluation.results.map((result) => (
                <li key={result.kpiId} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-fg">
                        {result.name} <span className="text-caption font-normal text-fg-subtle">· vazn {formatNumber(result.weight)}%</span>
                      </p>
                      <p className="text-caption text-fg-subtle">{result.method}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-body text-fg tabular-nums">
                        {formatKpiValue(result.actual, result.unit)} <span className="text-fg-subtle">/ {formatKpiValue(result.target, result.unit)}</span>
                      </p>
                      <p className="text-caption text-fg-muted">{result.basis}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <span className={cn('block h-full rounded-full', achievementTone(result.achievement))} style={{ width: `${result.achievement ?? 0}%` }} />
                    </span>
                    <span className="w-24 shrink-0 text-right text-caption text-fg-muted tabular-nums">
                      {result.achievement === null ? 'bahoga kirmadi' : `${formatNumber(result.achievement)}% bajarildi`}
                    </span>
                  </div>
                  {result.manual && (
                    <p className="mt-1 text-caption text-fg-subtle">
                      Kiritdi: {result.manual.createdBy ? `${result.manual.createdBy.firstName} ${result.manual.createdBy.lastName}` : '—'} ·{' '}
                      {formatDate(result.manual.updatedAt)} · {result.manual.reason}
                    </p>
                  )}
                  {result.metric === 'MANUAL' && canEnterManual && (
                    <Button size="sm" variant="ghost" className="mt-1" leftIcon={<PencilLine className="size-3.5" aria-hidden />} onClick={() => setManual(result)}>
                      {result.manual ? 'Natijani o‘zgartirish' : 'Natijani kiritish'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {evaluation.acquisitions.length > 0 && (
          <div>
            <p className="mb-2 text-overline text-fg-subtle uppercase">Jalb qilingan o‘quvchilar · {formatNumber(evaluation.acquisitions.length)}</p>
            <ul className="divide-y divide-border rounded-control border border-border">
              {evaluation.acquisitions.map((row) => (
                <li key={row.studentId} className="flex items-center justify-between gap-3 px-3 py-2 text-body">
                  <span className="min-w-0">
                    <Link to={`/students/${row.studentId}`} className="font-medium text-fg hover:text-primary hover:underline">
                      {row.studentName}
                    </Link>{' '}
                    <span className="font-mono text-caption text-fg-subtle">{row.code}</span>
                  </span>
                  <span className="shrink-0 text-caption text-fg-muted tabular-nums">
                    birinchi to‘lov {formatDate(row.paidAt)} · {formatMoney(row.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      {manual && (
        <ManualResultModal
          result={manual}
          employeeId={employeeId}
          year={year}
          month={month}
          onClose={() => setManual(null)}
          onSaved={() => {
            setManual(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' }) {
  return (
    <div className="rounded-control bg-surface-muted px-3 py-2">
      <p className="text-caption text-fg-muted">{label}</p>
      <p className={cn('text-body-lg font-semibold tabular-nums', tone === 'success' ? 'text-success' : 'text-fg')}>{value}</p>
    </div>
  );
}

function ManualResultModal({
  result,
  employeeId,
  year,
  month,
  onClose,
  onSaved,
}: {
  result: KpiResult;
  employeeId: string;
  year: number;
  month: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [actual, setActual] = useState(result.actual === null ? '' : String(result.actual));
  const [reason, setReason] = useState(result.manual?.reason ?? '');
  const [error, setError] = useState<string | null>(null);
  const value = Number(actual.replace(',', '.'));
  const valid = actual.trim() !== '' && Number.isFinite(value) && value >= 0 && reason.trim().length >= 3;

  const save = useMutation({
    mutationFn: () => salaryService.saveKpiResult({ kpiId: result.kpiId, employeeId, year, month, actual: value, reason: reason.trim() }),
    onSuccess: (response) => {
      toast.success(response.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title={result.name}
      description={`Maqsad: ${formatKpiValue(result.target, result.unit)} · vazn ${formatNumber(result.weight)}%`}
      onClose={onClose}
      closeDisabled={save.isPending}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label={result.unit === 'COUNT' ? 'Natija (soni)' : 'Natija, %'} htmlFor="kpi-actual" required>
          <Input id="kpi-actual" inputMode="decimal" autoFocus value={actual} onChange={(event) => setActual(event.target.value)} />
        </FormField>
        <FormField label="Manba va sabab" htmlFor="kpi-reason" required hint="Masalan: ota-onalar so‘rovi, 42 javob">
          <Textarea id="kpi-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
