import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Wallet, Wrench } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { SuggestInput } from '@/components/ui/SuggestInput';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import { roomsService } from '@/services/rooms.service';
import type { AssetDetail, AssetEventPayload, AssetStatus } from '@/types/org';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';
import { ASSET_STATUS_LABELS, ASSET_STATUS_TONES, personName } from '@/utils/orgLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';

const STATUSES = Object.keys(ASSET_STATUS_LABELS) as AssetStatus[];
const EVENT_LABELS: Record<AssetDetail['events'][number]['type'], string> = {
  CREATED: 'Ro‘yxatga olindi',
  UPDATED: 'Ma’lumotlari tahrirlandi',
  ASSIGNED: 'Mas’ul o‘zgardi',
  MOVED: 'Ko‘chirildi',
  STATUS_CHANGED: 'Holati o‘zgardi',
  REPAIR: 'Ta’mirlandi',
};

/**
 * Aktivlar reyestri (ORG §11): inventar raqami, xarid sanasi va qiymati, holati, joylashuvi, mas'uli va ta'mir tarixi.
 * Sotiladigan tovarlar alohida ("Ombor"); aktiv biriktiriladi, ko'chiriladi, ta'mirlanadi va hisobdan chiqariladi.
 */
export default function AssetsPage() {
  const canManage = usePermission(PERMISSIONS.ASSET_MANAGE);
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const filters = { status, category, search };
  const query = useQuery({
    queryKey: queryKeys.org.assets(filters),
    queryFn: () => orgService.assets({ ...(status ? { status } : {}), ...(category ? { category } : {}), ...(search ? { search } : {}), limit: 100 }),
    placeholderData: keepPreviousData,
  });
  const summary = query.data?.summary;
  const open = (id: string | null) => setParams(id ? { id } : {}, { replace: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivlar"
        description="Markaz jihozlari: kim javobgar, qayerda, qanday holatda"
        actions={
          canManage && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              Aktiv qo‘shish
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard size="sm" title="Balansda" value={summary?.count ?? 0} icon={Boxes} loading={query.isPending} />
        <StatCard size="sm" title="Balans qiymati" value={formatMoney(summary?.value ?? 0)} icon={Wallet} tone="primary" loading={query.isPending} />
        <StatCard size="sm" title="Ta’mirda" value={summary?.byStatus.UNDER_REPAIR ?? 0} icon={Wrench} tone="warning" loading={query.isPending} />
        <StatCard size="sm" title="Hisobdan chiqarilgan" value={(summary?.byStatus.WRITTEN_OFF ?? 0) + (summary?.byStatus.LOST ?? 0)} icon={Boxes} loading={query.isPending} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Holat" value={status} onChange={(event) => setStatus(event.target.value as AssetStatus | '')} wrapperClassName="w-48">
          <option value="">Barcha holatlar</option>
          {STATUSES.map((key) => (
            <option key={key} value={key}>
              {ASSET_STATUS_LABELS[key]}
            </option>
          ))}
        </Select>
        <Select aria-label="Turkum" value={category} onChange={(event) => setCategory(event.target.value)} wrapperClassName="w-48">
          <option value="">Barcha turkumlar</option>
          {(query.data?.categories ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
        <SearchInput label="Aktiv qidirish" placeholder="Nom, inventar yoki seriya raqami" value={search} onChange={setSearch} className="w-full sm:ml-auto sm:w-72" />
      </div>
      <Card>
        {query.isPending ? (
          <Skeleton className="m-4 h-32" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Boxes} title="Aktiv yo‘q" description="Kompyuter, proyektor, mebel va boshqa jihozlarni ro‘yxatga oling" />
        ) : (
          <ul className="divide-y divide-border">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => open(item.id)} className="flex w-full flex-col gap-1 p-4 text-left hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                      <span className="text-fg-subtle">{item.inventoryNumber}</span>
                      {item.name}
                      <Badge tone={ASSET_STATUS_TONES[item.status]}>{ASSET_STATUS_LABELS[item.status]}</Badge>
                    </p>
                    <p className="text-caption text-fg-muted">
                      {item.category}
                      {item.room || item.location ? ` · ${item.room?.name ?? item.location}` : ''}
                      {` · mas’ul: ${item.responsible ? personName(item.responsible) : '—'}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-body text-fg-muted">{item.purchaseCost !== null ? formatMoney(item.purchaseCost) : '—'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {creating && <AssetFormModal categories={query.data?.categories ?? []} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); open(id); }} />}
      <AssetDrawer id={openId} canManage={canManage} onClose={() => open(null)} />
    </div>
  );
}

function AssetFormModal({ categories, onClose, onSaved }: { categories: string[]; onClose: () => void; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ inventoryNumber: '', name: '', category: '', serialNumber: '', purchaseDate: '', purchaseCost: '', condition: '', responsibleId: '', roomId: '', location: '', note: '' });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, staleTime: 60_000, retry: false });
  const rooms = useQuery({ queryKey: queryKeys.rooms.list(false), queryFn: () => roomsService.list() });
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      orgService.createAsset(
        Object.fromEntries(
          Object.entries({ ...form, purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : '' }).filter(([, value]) => value !== ''),
        ),
      ),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onSaved(result.data.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const valid = form.inventoryNumber.trim() && form.name.trim().length >= 2 && form.category.trim().length >= 2;

  return (
    <Modal
      open
      size="lg"
      title="Aktiv qo‘shish"
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="asset-form" disabled={!valid} loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="asset-form" className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit} noValidate>
        <FormField label="Inventar raqami" htmlFor="asset-number" required>
          <Input id="asset-number" value={form.inventoryNumber} maxLength={50} placeholder="INV-0001" onChange={(event) => set('inventoryNumber')(event.target.value)} autoFocus />
        </FormField>
        <FormField label="Nomi" htmlFor="asset-name" required>
          <Input id="asset-name" value={form.name} maxLength={150} onChange={(event) => set('name')(event.target.value)} />
        </FormField>
        <FormField label="Turkum" htmlFor="asset-category" required>
          <SuggestInput id="asset-category" value={form.category} onChange={set('category')} suggestions={[...new Set([...categories, 'Kompyuter', 'Proyektor', 'Mebel', 'Kamera', 'Tarmoq jihozi'])]} placeholder="Tanlang yoki yozing" />
        </FormField>
        <FormField label="Seriya raqami" htmlFor="asset-serial">
          <Input id="asset-serial" value={form.serialNumber} maxLength={100} onChange={(event) => set('serialNumber')(event.target.value)} />
        </FormField>
        <FormField label="Xarid sanasi" htmlFor="asset-date">
          <Input id="asset-date" type="date" value={form.purchaseDate} onChange={(event) => set('purchaseDate')(event.target.value)} />
        </FormField>
        <FormField label="Xarid qiymati (so‘m)" htmlFor="asset-cost">
          <Input id="asset-cost" inputMode="numeric" value={form.purchaseCost} onChange={(event) => set('purchaseCost')(event.target.value.replace(/\D/g, ''))} />
        </FormField>
        <FormField label="Texnik holati" htmlFor="asset-condition">
          <Input id="asset-condition" value={form.condition} maxLength={100} placeholder="Yangi" onChange={(event) => set('condition')(event.target.value)} />
        </FormField>
        <FormField label="Mas’ul xodim" htmlFor="asset-responsible">
          <Select id="asset-responsible" value={form.responsibleId} onChange={(event) => set('responsibleId')(event.target.value)}>
            <option value="">Omborda (mas’ulsiz)</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {personName(person)} · {person.roleName}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Xona" htmlFor="asset-room">
          <Select id="asset-room" value={form.roomId} onChange={(event) => set('roomId')(event.target.value)}>
            <option value="">Tanlanmagan</option>
            {(rooms.data ?? []).map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Joylashuv (xona bo‘lmasa)" htmlFor="asset-location">
          <Input id="asset-location" value={form.location} maxLength={150} onChange={(event) => set('location')(event.target.value)} />
        </FormField>
        <FormField label="Izoh" htmlFor="asset-note">
          <Input id="asset-note" value={form.note} maxLength={1000} onChange={(event) => set('note')(event.target.value)} />
        </FormField>
      </form>
    </Modal>
  );
}

function AssetDrawer({ id, canManage, onClose }: { id: string | null; canManage: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.org.asset(id ?? ''), queryFn: () => orgService.asset(id!), enabled: Boolean(id) });
  const people = useQuery({ queryKey: queryKeys.org.people, queryFn: orgService.people, enabled: canManage && Boolean(id), staleTime: 60_000, retry: false });
  const rooms = useQuery({ queryKey: queryKeys.rooms.list(false), queryFn: () => roomsService.list(), enabled: canManage && Boolean(id) });
  const [action, setAction] = useState<AssetEventPayload['type'] | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [condition, setCondition] = useState('');
  const asset = query.data;
  const closed = asset?.status === 'WRITTEN_OFF' || asset?.status === 'LOST';

  const record = useMutation({
    mutationFn: () => {
      const extra = note.trim() ? { note: note.trim() } : {};
      const payload: AssetEventPayload =
        action === 'ASSIGNED'
          ? { type: 'ASSIGNED', ...(value ? { responsibleId: value } : {}), ...(condition.trim() ? { condition: condition.trim() } : {}), ...extra }
          : action === 'MOVED'
            ? { type: 'MOVED', ...(value.startsWith('room:') ? { roomId: value.slice(5) } : value ? { location: value } : {}), ...extra }
            : action === 'STATUS_CHANGED'
              ? { type: 'STATUS_CHANGED', status: value as AssetStatus, ...extra }
              : { type: 'REPAIR', note: note.trim(), ...(cost ? { cost: Number(cost) } : {}) };
      return orgService.assetEvent(id!, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setAction(null);
      setValue('');
      setNote('');
      setCost('');
      setCondition('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const ready = action === 'REPAIR' ? note.trim().length >= 3 : action === 'STATUS_CHANGED' ? Boolean(value) : true;

  return (
    <Drawer open={Boolean(id)} title={asset ? `${asset.inventoryNumber} · ${asset.name}` : 'Aktiv'} onClose={onClose} size="lg">
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : asset ? (
        <div className="space-y-5">
          <Badge tone={ASSET_STATUS_TONES[asset.status]}>{ASSET_STATUS_LABELS[asset.status]}</Badge>
          <dl className="grid grid-cols-2 gap-3 text-body">
            <Info label="Turkum" value={asset.category} />
            <Info label="Seriya raqami" value={asset.serialNumber ?? '—'} />
            <Info label="Xarid" value={`${asset.purchaseDate ? formatDate(asset.purchaseDate) : '—'} · ${asset.purchaseCost !== null ? formatMoney(asset.purchaseCost) : '—'}`} />
            <Info label="Ta’mir" value={`${asset.repairCount} marta · ${formatMoney(asset.repairCost)}`} />
            <Info label="Mas’ul" value={asset.responsible ? personName(asset.responsible) : 'Omborda'} />
            <Info label="Joylashuv" value={asset.room?.name ?? asset.location ?? '—'} />
            <Info label="Texnik holati" value={asset.condition ?? '—'} />
          </dl>
          {asset.note && <p className="text-body text-fg-muted">{asset.note}</p>}

          {canManage && (
            <div className="flex flex-wrap gap-2">
              {!closed && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => { setAction('ASSIGNED'); setValue(''); }}>
                    {asset.responsible ? 'Qaytarish / boshqaga berish' : 'Mas’ulga berish'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setAction('MOVED'); setValue(''); }}>
                    Ko‘chirish
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setAction('REPAIR')}>
                    Ta’mir yozuvi
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setAction('STATUS_CHANGED'); setValue(''); }}>
                Holatni o‘zgartirish
              </Button>
            </div>
          )}
          {action && (
            <form
              className="space-y-2 rounded-md border border-border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                record.mutate();
              }}
            >
              {action === 'ASSIGNED' && (
                <Select aria-label="Yangi mas’ul" value={value} onChange={(event) => setValue(event.target.value)}>
                  <option value="">Omborga qaytarish (mas’ulsiz)</option>
                  {(people.data ?? [])
                    .filter((person) => person.id !== asset.responsible?.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {personName(person)}
                      </option>
                    ))}
                </Select>
              )}
              {action === 'MOVED' && (
                <Select aria-label="Yangi joy" value={value} onChange={(event) => setValue(event.target.value)}>
                  <option value="">Joy tanlanmagan</option>
                  {(rooms.data ?? []).map((room) => (
                    <option key={room.id} value={`room:${room.id}`}>
                      {room.name}
                    </option>
                  ))}
                  <option value="Ombor">Ombor</option>
                </Select>
              )}
              {action === 'STATUS_CHANGED' && (
                <Select aria-label="Yangi holat" value={value} onChange={(event) => setValue(event.target.value)}>
                  <option value="">Holatni tanlang</option>
                  {STATUSES.filter((key) => key !== asset.status).map((key) => (
                    <option key={key} value={key}>
                      {ASSET_STATUS_LABELS[key]}
                    </option>
                  ))}
                </Select>
              )}
              {action === 'ASSIGNED' && <Input aria-label="Texnik holati" placeholder="Texnik holati: yaxshi, chizilgan…" maxLength={100} value={condition} onChange={(event) => setCondition(event.target.value)} />}
              {action === 'REPAIR' && <Input aria-label="Ta’mir xarajati" inputMode="numeric" placeholder="Xarajat (so‘m)" value={cost} onChange={(event) => setCost(event.target.value.replace(/\D/g, ''))} />}
              <Textarea aria-label="Izoh" rows={2} maxLength={1000} placeholder={action === 'REPAIR' ? 'Nima ta’mirlandi?' : 'Izoh'} value={note} onChange={(event) => setNote(event.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!ready} loading={record.isPending}>
                  Saqlash
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
                  Bekor
                </Button>
              </div>
            </form>
          )}

          <section>
            <h3 className="mb-2 text-label font-medium text-fg">Tarix</h3>
            <ol className="space-y-2">
              {asset.events.map((event) => (
                <li key={event.id} className="rounded-md bg-surface-muted p-3 text-body">
                  <p className="text-caption text-fg-subtle">
                    {formatDateTime(event.occurredAt)} · {personName(event.actor)}
                  </p>
                  <p className="text-fg">
                    {EVENT_LABELS[event.type]}
                    {event.fromValue || event.toValue ? `: ${event.fromValue ?? '—'} → ${event.toValue ?? '—'}` : ''}
                    {event.cost !== null ? ` · ${formatMoney(event.cost)}` : ''}
                  </p>
                  {event.note && <p className="text-caption text-fg-muted">{event.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
