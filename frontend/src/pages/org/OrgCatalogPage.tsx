import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Building, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
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
import { orgService } from '@/services/org.service';
import type { Department, Position, Responsibility } from '@/types/org';
import { formatMoney } from '@/utils/format';
import { personName } from '@/utils/orgLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const PRIORITY_LABELS: Record<Responsibility['priority'], string> = { LOW: 'Past', NORMAL: 'Oddiy', HIGH: 'Yuqori', URGENT: 'Shoshilinch' };

/**
 * Bo‘limlar va lavozimlar katalogi: har lavozimning mas’uliyatlari (lavozim yo‘riqnomasi), sinov muddati va
 * karyera yo‘li (keyingi lavozim, talablar, eng kam KPI). Tahrirlash — markaz rahbari (`org.manage`).
 */
export default function OrgCatalogPage() {
  const canManage = usePermission(PERMISSIONS.ORG_MANAGE);
  const departments = useQuery({ queryKey: queryKeys.org.departments, queryFn: () => orgService.departments() });
  const positions = useQuery({ queryKey: queryKeys.org.positions, queryFn: orgService.positions });
  const canSeeExpenses = usePermission(PERMISSIONS.EXPENSE_VIEW);
  const now = new Date();
  const spending = useQuery({
    queryKey: ['org', 'spending', now.getFullYear(), now.getMonth() + 1],
    queryFn: () => orgService.departmentSpending(now.getFullYear(), now.getMonth() + 1),
    enabled: canSeeExpenses,
    retry: false,
  });
  const [department, setDepartment] = useState<Department | 'new' | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [responsibility, setResponsibility] = useState<{ position: Position; item: Responsibility | null } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader title="Lavozimlar va bo‘limlar" description="Har bir xodimning aniq lavozimi, mas’uliyati va o‘sish yo‘li" />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building className="size-4 text-fg-subtle" aria-hidden />
            Bo‘limlar
          </CardTitle>
          {canManage && (
            <Button size="sm" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDepartment('new')}>
              Bo‘lim
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {departments.isPending ? (
            <Skeleton className="m-4 h-20" />
          ) : departments.isError ? (
            <ErrorState error={departments.error} onRetry={() => void departments.refetch()} />
          ) : (
            <ul className="divide-y divide-border">
              {departments.data.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{item.name}</p>
                    <p className="text-caption text-fg-muted">
                      Rahbar: {item.head ? personName(item.head) : 'markaz rahbari'} · {item.employees} xodim · {item.positions} lavozim
                      {item.monthlyExpenseLimit !== null ? ` · oylik xarajat limiti: ${formatMoney(item.monthlyExpenseLimit)}` : ''}
                    </p>
                    <SpendingLine row={spending.data?.rows.find((row) => row.id === item.id)} />
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" aria-label={`${item.name} — tahrirlash`} onClick={() => setDepartment(item)}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {positions.isPending ? (
        <Skeleton className="h-64" />
      ) : positions.isError ? (
        <ErrorState error={positions.error} onRetry={() => void positions.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {positions.data.map((item) => (
            <Card key={item.key}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle>{item.title}</CardTitle>
                  <p className="text-caption text-fg-muted">
                    {item.department?.name ?? 'Bo‘limsiz'} · {item.holders} xodim · sinov {item.probationMonths} oy
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!item.isActive && <Badge tone="gray">Faol emas</Badge>}
                  {item.holders === 0 && item.isActive && <Badge tone="yellow">Vakant</Badge>}
                  {canManage && (
                    <Button size="sm" variant="ghost" aria-label={`${item.title} — tahrirlash`} onClick={() => setPosition(item)}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.description && <p className="text-body text-fg-muted">{item.description}</p>}
                {item.responsibilities.filter((entry) => entry.isActive).length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-body text-fg">
                    {item.responsibilities
                      .filter((entry) => entry.isActive)
                      .map((entry) => (
                        <li key={entry.id}>
                          {canManage ? (
                            <button type="button" className="text-left hover:underline" onClick={() => setResponsibility({ position: item, item: entry })}>
                              {entry.title}
                            </button>
                          ) : (
                            entry.title
                          )}
                          {entry.expectedResult ? <span className="text-caption text-fg-subtle"> — {entry.expectedResult}</span> : null}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-caption text-fg-subtle">Mas’uliyatlar kiritilmagan</p>
                )}
                {canManage && (
                  <Button size="sm" variant="ghost" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setResponsibility({ position: item, item: null })}>
                    Mas’uliyat
                  </Button>
                )}
                {item.nextPosition && (
                  <div className="rounded-md bg-surface-muted p-3 text-body">
                    <p className="flex items-center gap-1 font-medium text-fg">
                      Karyera yo‘li <ArrowRight className="size-4" aria-hidden /> {item.nextPosition.title}
                    </p>
                    <p className="text-caption text-fg-muted">
                      {item.minimumKpiScore !== null ? `KPI kamida ${item.minimumKpiScore}%` : ''}
                      {item.minimumMonths !== null ? `${item.minimumKpiScore !== null ? ' · ' : ''}lavozimda kamida ${item.minimumMonths} oy` : ''}
                    </p>
                    {item.careerRequirements && <p className="mt-1 whitespace-pre-line text-caption text-fg-muted">{item.careerRequirements}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {department && <DepartmentModal department={department === 'new' ? null : department} departments={departments.data ?? []} onClose={() => setDepartment(null)} />}
      {position && <PositionModal position={position} positions={positions.data ?? []} departments={departments.data ?? []} onClose={() => setPosition(null)} />}
      {responsibility && <ResponsibilityModal position={responsibility.position} item={responsibility.item} onClose={() => setResponsibility(null)} />}
    </div>
  );
}

function useSave<T>(mutationFn: () => Promise<{ message: string; data: T }>, onClose: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
}

function DepartmentModal({ department, departments, onClose }: { department: Department | null; departments: Department[]; onClose: () => void }) {
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, staleTime: 60_000 });
  const [form, setForm] = useState({
    name: department?.name ?? '',
    description: department?.description ?? '',
    headUserId: department?.head?.id ?? '',
    parentId: department?.parentId ?? '',
    monthlyExpenseLimit: department?.monthlyExpenseLimit !== null && department?.monthlyExpenseLimit !== undefined ? String(department.monthlyExpenseLimit) : '',
  });
  const save = useSave(
    () =>
      orgService.saveDepartment(department?.id ?? null, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        headUserId: form.headUserId || null,
        parentId: form.parentId || null,
        monthlyExpenseLimit: form.monthlyExpenseLimit ? Number(form.monthlyExpenseLimit) : null,
      }),
    onClose,
  );
  return (
    <Modal
      open
      title={department ? 'Bo‘limni tahrirlash' : 'Yangi bo‘lim'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button disabled={form.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Nomi" htmlFor="department-name" required>
          <Input id="department-name" value={form.name} maxLength={100} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus />
        </FormField>
        <FormField label="Bo‘lim rahbari" htmlFor="department-head" hint="Tanlanmasa — markaz rahbari">
          <Select id="department-head" value={form.headUserId} onChange={(event) => setForm({ ...form, headUserId: event.target.value })}>
            <option value="">Markaz rahbari (CEO)</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)} · {person.roleName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Yuqori bo‘lim" htmlFor="department-parent">
          <Select id="department-parent" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
            <option value="">Yo‘q</option>
            {departments
              .filter((item) => item.id !== department?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Oylik xarajat limiti (so‘m)" htmlFor="department-limit" hint="Limitdan yuqori xarajat rahbar tasdig‘iga ketadi">
          <Input id="department-limit" inputMode="numeric" value={form.monthlyExpenseLimit} onChange={(event) => setForm({ ...form, monthlyExpenseLimit: event.target.value.replace(/\D/g, '') })} />
        </FormField>
        <FormField label="Tavsif" htmlFor="department-description">
          <Textarea id="department-description" rows={2} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </FormField>
      </div>
    </Modal>
  );
}

function PositionModal({ position, positions, departments, onClose }: { position: Position; positions: Position[]; departments: Department[]; onClose: () => void }) {
  const [form, setForm] = useState({
    title: position.title,
    departmentId: position.department?.id ?? '',
    description: position.description ?? '',
    probationMonths: String(position.probationMonths),
    nextPositionKey: position.nextPosition?.key ?? '',
    minimumKpiScore: position.minimumKpiScore !== null ? String(position.minimumKpiScore) : '',
    minimumMonths: position.minimumMonths !== null ? String(position.minimumMonths) : '',
    careerRequirements: position.careerRequirements ?? '',
  });
  const save = useSave(
    () =>
      orgService.updatePosition(position.key, {
        title: form.title.trim(),
        departmentId: form.departmentId || null,
        description: form.description.trim() || null,
        probationMonths: Number(form.probationMonths || 0),
        nextPositionKey: form.nextPositionKey || null,
        minimumKpiScore: form.minimumKpiScore ? Number(form.minimumKpiScore) : null,
        minimumMonths: form.minimumMonths ? Number(form.minimumMonths) : null,
        careerRequirements: form.careerRequirements.trim() || null,
      }),
    onClose,
  );
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 3);
  return (
    <Modal
      open
      size="lg"
      title={`Lavozim: ${position.title}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button disabled={form.title.trim().length < 2} loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nomi" htmlFor="position-title" required>
          <Input id="position-title" value={form.title} maxLength={120} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </FormField>
        <FormField label="Bo‘lim" htmlFor="position-department">
          <Select id="position-department" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })}>
            <option value="">Bo‘limsiz</option>
            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Sinov muddati (oy)" htmlFor="position-probation">
          <Input id="position-probation" inputMode="numeric" value={form.probationMonths} onChange={(event) => setForm({ ...form, probationMonths: digits(event.target.value) })} />
        </FormField>
        <FormField label="Keyingi lavozim (karyera)" htmlFor="position-next">
          <Select id="position-next" value={form.nextPositionKey} onChange={(event) => setForm({ ...form, nextPositionKey: event.target.value })}>
            <option value="">Belgilanmagan</option>
            {positions
              .filter((item) => item.key !== position.key)
              .map((item) => (
                <option key={item.key} value={item.key}>
                  {item.title}
                </option>
              ))}
          </Select>
        </FormField>
        <FormField label="Eng kam o‘rtacha KPI (%)" htmlFor="position-kpi">
          <Input id="position-kpi" inputMode="numeric" value={form.minimumKpiScore} onChange={(event) => setForm({ ...form, minimumKpiScore: digits(event.target.value) })} />
        </FormField>
        <FormField label="Lavozimda eng kam muddat (oy)" htmlFor="position-months">
          <Input id="position-months" inputMode="numeric" value={form.minimumMonths} onChange={(event) => setForm({ ...form, minimumMonths: digits(event.target.value) })} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField label="Keyingi lavozim talablari" htmlFor="position-requirements">
            <Textarea id="position-requirements" rows={3} maxLength={2000} value={form.careerRequirements} onChange={(event) => setForm({ ...form, careerRequirements: event.target.value })} />
          </FormField>
        </div>
        <div className="sm:col-span-2">
          <FormField label="Tavsif" htmlFor="position-description">
            <Textarea id="position-description" rows={3} maxLength={2000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}

function ResponsibilityModal({ position, item, onClose }: { position: Position; item: Responsibility | null; onClose: () => void }) {
  const [form, setForm] = useState({ title: item?.title ?? '', expectedResult: item?.expectedResult ?? '', priority: item?.priority ?? ('NORMAL' as Responsibility['priority']) });
  const save = useSave(() => orgService.saveResponsibility(position.key, item?.id ?? null, { title: form.title.trim(), expectedResult: form.expectedResult.trim() || null, priority: form.priority }), onClose);
  const remove = useSave(() => orgService.saveResponsibility(position.key, item!.id, { title: form.title.trim(), priority: form.priority, isActive: false }), onClose);
  return (
    <Modal
      open
      title={item ? 'Mas’uliyatni tahrirlash' : `Mas’uliyat qo‘shish — ${position.title}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          {item && (
            <Button variant="ghost" loading={remove.isPending} onClick={() => remove.mutate()}>
              O‘chirish
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button disabled={form.title.trim().length < 3} loading={save.isPending} onClick={() => save.mutate()}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Mas’uliyat" htmlFor="responsibility-title" required>
          <Input id="responsibility-title" value={form.title} maxLength={200} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus />
        </FormField>
        <FormField label="Kutilgan natija" htmlFor="responsibility-result">
          <Input id="responsibility-result" value={form.expectedResult} maxLength={500} onChange={(event) => setForm({ ...form, expectedResult: event.target.value })} />
        </FormField>
        <FormField label="Ustuvorlik" htmlFor="responsibility-priority">
          <Select id="responsibility-priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Responsibility['priority'] })}>
            {(Object.keys(PRIORITY_LABELS) as Responsibility['priority'][]).map((key) => (
              <option key={key} value={key}>
                {PRIORITY_LABELS[key]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
    </Modal>
  );
}

function SpendingLine({ row }: { row: { spent: number; pending: number; limit: number | null; percent: number | null } | undefined }) {
  if (!row || (row.spent === 0 && row.limit === null)) return null;
  const over = row.limit !== null && row.spent > row.limit;
  return (
    <p className={over ? 'text-caption text-danger' : 'text-caption text-fg-subtle'}>
      Shu oy sarf: {formatMoney(row.spent)}
      {row.limit !== null ? ` / ${formatMoney(row.limit)} (${row.percent ?? 0}%)` : ''}
      {row.pending > 0 ? ` · tasdiq kutmoqda: ${formatMoney(row.pending)}` : ''}
    </p>
  );
}
