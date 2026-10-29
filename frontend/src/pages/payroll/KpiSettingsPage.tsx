import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, CirclePlus, Pencil, Power, Target, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { employeesService } from '@/services/employees.service';
import { salaryService } from '@/services/salary.service';
import type { EmployeePosition } from '@/types/employee';
import type { KpiDefinition, KpiDefinitionPayload, KpiMetric } from '@/types/payroll';
import { withCustomLabel } from '@/utils/customLabel';
import { EMPLOYEE_POSITION_LABELS } from '@/utils/employeeLabels';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { KpiPoolModal } from './KpiPoolModal';
import { KPI_METRIC_OPTIONS, formatKpiValue, payrollProfileUrl } from './payrollUtils';

const POSITIONS = Object.keys(EMPLOYEE_POSITION_LABELS) as EmployeePosition[];

/**
 * KPI sozlamalari (direktor): lavozim bo'yicha KPI, maqsad va vazn, bonus chegarasi va xodimlarning bonus fondlari.
 * Vaznlar yig'indisi 100% bo'lmagan lavozimda bonus hisoblanmaydi — bu yerda ochiq ko'rsatiladi.
 */
export default function KpiSettingsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.SALARY_APPROVE);
  const canViewEmployees = usePermission(PERMISSIONS.EMPLOYEE_VIEW);
  const [editing, setEditing] = useState<KpiDefinition | 'new' | null>(null);
  const [deactivating, setDeactivating] = useState<KpiDefinition | null>(null);
  const [pool, setPool] = useState<{ id: string; name: string; value: number } | null>(null);

  const query = useQuery({ queryKey: queryKeys.salaries.kpi, queryFn: () => salaryService.kpi() });
  const employeesQuery = useQuery({
    queryKey: queryKeys.employees.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    queryFn: () => employeesService.list({ page: 1, limit: 100, status: 'ACTIVE' }),
    enabled: canViewEmployees,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.salaries.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.employees.all });
  };
  const deactivate = useMutation({
    mutationFn: (kpi: KpiDefinition) => salaryService.updateKpi(kpi.id, { isActive: false }),
    onSuccess: (result) => {
      toast.success(result.message);
      setDeactivating(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const data = query.data;
  const kpiPositions = new Set((data?.definitions ?? []).filter((kpi) => kpi.isActive).map((kpi) => kpi.position));
  const employees = (employeesQuery.data?.items ?? []).filter((employee) => kpiPositions.has(employee.position));

  return (
    <>
      <PageHeader
        title="KPI sozlamalari"
        description="Administrator, operator va boshqa xodimlar uchun KPI, maqsad, vazn va bonus fondi"
        breadcrumb={<Breadcrumb items={[{ label: 'Maoshlar', to: '/salaries' }, { label: 'KPI sozlamalari' }]} />}
        actions={
          canManage && (
            <Button leftIcon={<CirclePlus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
              KPI qo‘shish
            </Button>
          )
        }
      />

      {query.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} retrying={query.isFetching} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          <BonusRuleCard threshold={data!.settings.threshold} canManage={canManage} onChanged={refresh} />

          {data!.definitions.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={Target}
                  title="KPI hali belgilanmagan"
                  description="Lavozim uchun KPI qo‘shing: masalan, administratorga to‘lov yig‘ilishi va davomat, operatorga jalb qilingan o‘quvchilar"
                  {...(canManage
                    ? {
                        action: (
                          <Button leftIcon={<CirclePlus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
                            KPI qo‘shish
                          </Button>
                        ),
                      }
                    : {})}
                />
              </CardContent>
            </Card>
          ) : (
            data!.positions.map((position) => {
              const items = data!.definitions.filter((kpi) => kpi.position === position.position);
              return (
                <Card key={position.position}>
                  <CardHeader>
                    <CardTitle>{position.label}</CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-caption text-fg-muted">{formatNumber(position.employees)} ta xodim</span>
                      {position.valid ? (
                        <Badge tone="success">
                          <CircleCheck className="size-3" aria-hidden /> Vaznlar 100%
                        </Badge>
                      ) : (
                        <Badge tone="danger">
                          <TriangleAlert className="size-3" aria-hidden /> Vaznlar {formatNumber(position.weightSum)}% — bonus hisoblanmaydi
                        </Badge>
                      )}
                    </span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                      {items.map((kpi) => (
                        <li key={kpi.id} className="flex items-start gap-3 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-body font-medium text-fg">
                              {kpi.name} {!kpi.isActive && <Badge tone="neutral">O‘chirilgan</Badge>}
                            </p>
                            {kpi.metricLabel !== kpi.name && <p className="text-caption text-fg-muted">{kpi.metricLabel}</p>}
                            <p className="text-caption text-fg-subtle">{kpi.method}</p>
                            {kpi.description && <p className="mt-0.5 text-caption text-fg-muted">{kpi.description}</p>}
                          </div>
                          <dl className="grid shrink-0 grid-cols-3 gap-4 text-right text-caption">
                            <div>
                              <dt className="text-fg-subtle">Maqsad</dt>
                              <dd className="text-body text-fg tabular-nums">{formatKpiValue(kpi.target, kpi.unit)}</dd>
                            </div>
                            <div>
                              <dt className="text-fg-subtle">Vazn</dt>
                              <dd className="text-body text-fg tabular-nums">{formatNumber(kpi.weight)}%</dd>
                            </div>
                            <div>
                              <dt className="text-fg-subtle">Amal qiladi</dt>
                              <dd className="text-fg-muted">
                                {formatDate(kpi.effectiveFrom)}
                                {kpi.effectiveTo ? ` — ${formatDate(kpi.effectiveTo)}` : ' dan'}
                              </dd>
                            </div>
                          </dl>
                          {canManage && (
                            <ActionMenu
                              label={`${kpi.name} — amallar`}
                              items={[
                                { label: 'Tahrirlash', icon: Pencil, onSelect: () => setEditing(kpi) },
                                ...(kpi.isActive ? [{ label: 'O‘chirish', icon: Power, tone: 'danger' as const, onSelect: () => setDeactivating(kpi) }] : []),
                              ]}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })
          )}

          {canViewEmployees && employees.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Bonus fondlari</CardTitle>
                <span className="text-caption text-fg-muted">KPI belgilangan lavozimlardagi faol xodimlar</span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {employees.map((employee) => (
                    <li key={employee.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0">
                        <Link to={payrollProfileUrl('EMPLOYEE', employee.id)} className="block truncate text-body font-medium text-fg hover:text-primary hover:underline">
                          {employee.firstName} {employee.lastName}
                        </Link>
                        <span className="block text-caption text-fg-muted">
                          {withCustomLabel(EMPLOYEE_POSITION_LABELS, employee.position, employee.positionTitle)} · belgilangan maosh {formatMoney(employee.baseSalary ?? 0)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className={employee.kpiBonusPool ? 'text-body font-medium text-fg tabular-nums' : 'text-caption text-warning'}>
                          {employee.kpiBonusPool ? formatMoney(employee.kpiBonusPool) : 'Fond belgilanmagan'}
                        </span>
                        {canManage && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPool({ id: employee.id, name: `${employee.firstName} ${employee.lastName}`, value: employee.kpiBonusPool ?? 0 })}
                          >
                            O‘zgartirish
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {editing && (
        <KpiFormModal
          kpi={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {pool && (
        <KpiPoolModal
          employeeId={pool.id}
          name={pool.name}
          initial={pool.value}
          onClose={() => setPool(null)}
          onSaved={() => {
            setPool(null);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={deactivating !== null}
        title="KPI'ni o‘chirish"
        description={
          deactivating
            ? `"${deactivating.name}" keyingi hisoblarda qatnashmaydi. Tasdiqlangan maoshlardagi natijalar o‘zgarmaydi. Lavozim vaznlari 100% bo‘lishi uchun boshqa KPI'larni moslang.`
            : ''
        }
        confirmLabel="O‘chirish"
        tone="danger"
        loading={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating)}
        onCancel={() => setDeactivating(null)}
      />
    </>
  );
}

function BonusRuleCard({ threshold, canManage, onChanged }: { threshold: number; canManage: boolean; onChanged: () => void }) {
  const [value, setValue] = useState(String(threshold));
  const number = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(number) && number >= 0 && number <= 100;
  const save = useMutation({
    mutationFn: () => salaryService.updateKpiSettings(number),
    onSuccess: (result) => {
      toast.success(result.message);
      onChanged();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bonus qoidasi</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-1 text-body text-fg-muted">
          <p>
            <strong className="text-fg">KPI bonusi = bonus fondi × vaznli bajarilish.</strong> Har KPI maqsadga nisbatan o‘lchanadi va 100% da cheklanadi.
          </p>
          <p>Vaznli bajarilish chegaradan past bo‘lsa bonus 0. Ma’lumoti yo‘q KPI bahoga kirmaydi va maoshda ogohlantirish chiqadi.</p>
          <p>Natijalar maosh hisoblangan paytda nusxalanadi — keyin KPI yoki fond o‘zgarsa ham tasdiqlangan oylar tushuntirib bo‘ladi.</p>
        </div>
        <div className="flex items-end gap-2">
          <FormField label="Chegara, %" htmlFor="kpi-threshold">
            <Input id="kpi-threshold" inputMode="numeric" className="w-24" value={value} disabled={!canManage} onChange={(event) => setValue(event.target.value)} />
          </FormField>
          {canManage && (
            <Button variant="secondary" loading={save.isPending} disabled={!valid || number === threshold} onClick={() => save.mutate()}>
              Saqlash
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function KpiFormModal({ kpi, onClose, onSaved }: { kpi: KpiDefinition | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const [form, setForm] = useState({
    name: kpi?.name ?? '',
    position: kpi?.position ?? ('ADMINISTRATOR' as EmployeePosition),
    metric: kpi?.metric ?? ('PAYMENT_COLLECTION' as KpiMetric),
    target: kpi ? String(kpi.target) : '',
    weight: kpi ? String(kpi.weight) : '',
    effectiveFrom: kpi?.effectiveFrom ?? monthStart,
    effectiveTo: kpi?.effectiveTo ?? '',
    description: kpi?.description ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const metric = KPI_METRIC_OPTIONS.find((option) => option.value === form.metric)!;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((previous) => ({ ...previous, [key]: value }));

  const payload: KpiDefinitionPayload = {
    name: form.name.trim(),
    position: form.position,
    metric: form.metric,
    target: Number(form.target.replace(',', '.')),
    weight: Number(form.weight),
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo || null,
    description: form.description.trim(),
  };
  const save = useMutation({
    mutationFn: () => (kpi ? salaryService.updateKpi(kpi.id, payload) : salaryService.createKpi(payload)),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => {
      setError(getErrorMessage(mutationError));
      const details = (mutationError as { response?: { data?: { errors?: Array<{ field: string; message: string }> } } }).response?.data?.errors ?? [];
      setFieldErrors(Object.fromEntries(details.map((item) => [item.field, item.message])));
    },
  });

  return (
    <Modal
      open
      title={kpi ? 'KPI’ni tahrirlash' : 'Yangi KPI'}
      description="Natija CRM yozuvlaridan hisoblanadi; o‘lchov usuli quyida izohlangan"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FormField label="Nomi" htmlFor="kpi-name" required error={fieldErrors.name}>
          <Input id="kpi-name" autoFocus value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="Masalan: To‘lov yig‘ilishi" />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Lavozim" htmlFor="kpi-position" required error={fieldErrors.position}>
            <Select id="kpi-position" value={form.position} onChange={(event) => set('position', event.target.value as EmployeePosition)}>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {EMPLOYEE_POSITION_LABELS[position]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="O‘lchov usuli" htmlFor="kpi-metric" required error={fieldErrors.metric}>
            <Select id="kpi-metric" value={form.metric} onChange={(event) => set('metric', event.target.value as KpiMetric)}>
              {KPI_METRIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <Alert tone="info" title={`${metric.label} · ${metric.forRole}`}>
          {metric.hint}
        </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={metric.unit === 'COUNT' ? 'Maqsad (soni)' : 'Maqsad, %'} htmlFor="kpi-target" required error={fieldErrors.target}>
            <Input id="kpi-target" inputMode="decimal" value={form.target} onChange={(event) => set('target', event.target.value)} />
          </FormField>
          <FormField label="Vazn, %" htmlFor="kpi-weight" required hint="Lavozim KPI vaznlari jami 100%" error={fieldErrors.weight}>
            <Input id="kpi-weight" inputMode="numeric" value={form.weight} onChange={(event) => set('weight', event.target.value)} />
          </FormField>
          <FormField label="Amal qilish boshlanishi" htmlFor="kpi-from" required error={fieldErrors.effectiveFrom}>
            <Input id="kpi-from" type="date" value={form.effectiveFrom} onChange={(event) => set('effectiveFrom', event.target.value)} />
          </FormField>
          <FormField label="Tugashi (ixtiyoriy)" htmlFor="kpi-to" error={fieldErrors.effectiveTo}>
            <Input id="kpi-to" type="date" value={form.effectiveTo} onChange={(event) => set('effectiveTo', event.target.value)} />
          </FormField>
        </div>
        <FormField label="Shartlar va izoh" htmlFor="kpi-description" hint="Masalan: faqat asosiy filial; o‘lchov manbasi">
          <Textarea id="kpi-description" rows={2} value={form.description} onChange={(event) => set('description', event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
