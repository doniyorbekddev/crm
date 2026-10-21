import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Layers, Percent, Plus, UserMinus, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { studentsService } from '@/services/students.service';
import type { StudentExtraGroup, StudentItem } from '@/types/student';
import type { WeekDay } from '@/types/group';
import { WEEK_DAY_LABELS } from '@/utils/courseLabels';
import { formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { GroupOptions } from '../GroupOptions';
import { TransferGroupModal } from '../TransferGroupModal';

function scheduleOf(group: StudentExtraGroup): string {
  const days = group.scheduleDays.map((day) => WEEK_DAY_LABELS[day as WeekDay]?.slice(0, 2) ?? day).join(', ');
  return `${days} · ${group.startTime}–${group.endTime}`;
}

/**
 * O'quvchining joriy guruhlari: asosiy (to'lov va o'qituvchi foizi shunga yoziladi) va qo'shimcha o'quv
 * guruhlari (masalan, PMT: Matematika + Ingliz tili). Qo'shimcha guruh alohida shartnoma yoki qarz yaratmaydi.
 */
export function StudentGroupsCard({ student, canManage }: { student: StudentItem; canManage: boolean }) {
  const queryClient = useQueryClient();
  // Ulush maosh hisobiga ta'sir qiladi — maoshni hisoblash huquqi kerak
  const canSetShare = usePermission(PERMISSIONS.SALARY_CALCULATE);
  const [dialog, setDialog] = useState<
    { type: 'transfer' } | { type: 'add' } | { type: 'remove'; group: StudentExtraGroup } | { type: 'share'; group: StudentExtraGroup } | null
  >(null);
  const saved = () => {
    setDialog(null);
    void queryClient.invalidateQueries({ queryKey: queryKeys.students.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.groups.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.lookups.studentForm });
  };

  return (
    <div className="border-b border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <p className="text-label text-fg">Joriy guruhlar</p>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leftIcon={<ArrowLeftRight className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'transfer' })}>
              Asosiy guruhni o‘zgartirish
            </Button>
            <Button size="sm" variant="secondary" leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'add' })}>
              Qo‘shimcha guruh
            </Button>
          </div>
        )}
      </div>

      <ul className="divide-y divide-border border-t border-border">
        <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
              {student.group ? (
                <Link to={`/groups/${student.group.id}`} className="hover:text-primary hover:underline">
                  {student.group.name}
                </Link>
              ) : (
                'Guruhsiz'
              )}
              <Badge tone="primary">Asosiy</Badge>
            </p>
            <p className="text-caption text-fg-muted">{student.course.name}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-caption text-fg-subtle">
            <Wallet className="size-3.5" aria-hidden />
            Oylik to‘lov shu guruh bo‘yicha
            {student.extraGroups.some((group) => group.commissionShare > 0) &&
              ` · asosiy o‘qituvchi ulushi ${100 - student.extraGroups.reduce((sum, group) => sum + group.commissionShare, 0)}%`}
          </span>
        </li>
        {student.extraGroups.map((group) => (
          <li key={group.membershipId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-body font-medium text-fg">
                <Link to={`/groups/${group.id}`} className="hover:text-primary hover:underline">
                  {group.name}
                </Link>
                <Badge tone="neutral">Qo‘shimcha</Badge>
                {group.commissionShare > 0 && <Badge tone="blue">Ulush {group.commissionShare}%</Badge>}
              </p>
              <p className="text-caption text-fg-muted">
                {group.course.name}
                {group.teacher ? ` · ${group.teacher.firstName} ${group.teacher.lastName}` : ''} · {scheduleOf(group)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {canSetShare && (
                <Button size="sm" variant="ghost" leftIcon={<Percent className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'share', group })}>
                  Ulush
                </Button>
              )}
              {canManage && (
                <Button size="sm" variant="ghost" leftIcon={<UserMinus className="size-4" aria-hidden />} onClick={() => setDialog({ type: 'remove', group })}>
                  Chiqarish
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {student.extraGroups.length > 0 && (
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-2 text-caption text-fg-subtle">
          <Layers className="size-3.5" aria-hidden />
          Davomat, vazifa va imtihonlar har guruhda alohida; to‘lov va qarz bitta — o‘quvchi profilida.
        </p>
      )}

      {dialog?.type === 'transfer' && <TransferGroupModal student={student} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'add' && <AddGroupModal student={student} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'remove' && <RemoveGroupModal student={student} group={dialog.group} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.type === 'share' && <ShareModal student={student} group={dialog.group} onClose={() => setDialog(null)} onSaved={saved} />}
    </div>
  );
}

function AddGroupModal({ student, onClose, onSaved }: { student: StudentItem; onClose: () => void; onSaved: () => void }) {
  const [groupId, setGroupId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lookupsQuery = useQuery({ queryKey: queryKeys.lookups.studentForm, queryFn: studentsService.formLookups, staleTime: 60_000 });
  const save = useMutation({
    mutationFn: () => studentsService.addGroup(student.id, { groupId, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <Modal
      open
      title="Qo‘shimcha guruhga qo‘shish"
      description={`${student.firstName} ${student.lastName} · ${student.code}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} disabled={!groupId} onClick={() => save.mutate()}>
            Qo‘shish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="info">
          Masalan, PMT: Matematika va Ingliz tili. O‘quvchi profili bitta qoladi; yangi shartnoma, qarz yoki oylik to‘lov yaratilmaydi —
          to‘lov asosiy guruh bo‘yicha yuritiladi.
        </Alert>
        <FormField label="Guruh" htmlFor="extra-group" required hint="Barcha ochiq guruhlar, kurs bo‘yicha">
          <Select id="extra-group" value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={lookupsQuery.isPending}>
            <option value="">Tanlang…</option>
            <GroupOptions
              lookups={lookupsQuery.data}
              anyCourse
              excludeGroupIds={[...(student.group ? [student.group.id] : []), ...student.extraGroups.map((group) => group.id)]}
            />
          </Select>
        </FormField>
        <FormField label="Izoh" htmlFor="extra-group-reason" hint="Ixtiyoriy · guruh tarixida saqlanadi">
          <Textarea id="extra-group-reason" rows={2} maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

function RemoveGroupModal({ student, group, onClose, onSaved }: { student: StudentItem; group: StudentExtraGroup; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => studentsService.removeGroup(student.id, group.id, reason.trim()),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });
  return (
    <Modal
      open
      title="Qo‘shimcha guruhdan chiqarish"
      description={`${student.firstName} ${student.lastName} · ${group.name}`}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button variant="danger" loading={save.isPending} disabled={reason.trim().length < 3} onClick={() => save.mutate()}>
            Chiqarish
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Alert tone="info">Faqat shu guruhdagi a’zolik yopiladi — boshqa guruhlar, davomat tarixi, to‘lov va qarz o‘zgarmaydi.</Alert>
        <FormField label="Sabab" htmlFor="extra-group-remove" required hint="Guruh tarixida saqlanadi">
          <Textarea id="extra-group-remove" rows={3} maxLength={255} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}

/**
 * PMT: qo'shimcha guruh o'qituvchisiga oylik to'lovdan ulush. Faqat keyingi to'lovlarga ta'sir qiladi —
 * bo'linish har to'lov paytida qotiriladi, o'tgan to'lov va maoshlar o'zgarmaydi.
 */
function ShareModal({ student, group, onClose, onSaved }: { student: StudentItem; group: StudentExtraGroup; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(group.commissionShare));
  const [error, setError] = useState<string | null>(null);
  const others = student.extraGroups.filter((item) => item.id !== group.id).reduce((sum, item) => sum + item.commissionShare, 0);
  const share = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(share) && share >= 0 && others + share <= 100 && Math.round(share * 100) === share * 100;
  const save = useMutation({
    mutationFn: () => studentsService.setGroupShare(student.id, group.id, share),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });
  const example = 1_000_000;
  const extraPart = valid ? Math.round((example * share) / 100) : 0;

  return (
    <Modal
      open
      title="O‘qituvchi ulushi"
      description={`${student.firstName} ${student.lastName} · ${group.name}${group.teacher ? ` · ${group.teacher.firstName} ${group.teacher.lastName}` : ''}`}
      onClose={onClose}
      closeDisabled={save.isPending}
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
        <Alert tone="info">
          O‘quvchining oylik to‘lovidan shu ulush «{group.name}» o‘qituvchisining foiz asosiga, qolgani asosiy guruh o‘qituvchisiga yoziladi.
          Faqat keyingi to‘lovlarga amal qiladi — o‘tgan to‘lovlar va maoshlar o‘zgarmaydi.
        </Alert>
        <FormField
          label="Ulush, %"
          htmlFor="group-share"
          hint={others > 0 ? `Boshqa qo‘shimcha guruhlarda: ${others}% · jami 100% dan oshmasin` : '0 — hammasi asosiy guruh o‘qituvchisiga'}
          {...(value.trim() !== '' && !valid ? { error: `0 dan ${100 - others} gacha` } : {})}
        >
          <Input id="group-share" inputMode="decimal" value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
        </FormField>
        {valid && share > 0 && (
          <p className="text-caption text-fg-muted">
            Masalan, {formatMoney(example)} to‘lovdan: «{group.name}» o‘qituvchisiga {formatMoney(extraPart)}, asosiy guruh o‘qituvchisiga{' '}
            {formatMoney(example - extraPart)} (har biri o‘z foizi bilan).
          </p>
        )}
      </div>
    </Modal>
  );
}
