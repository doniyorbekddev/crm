import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { parentsService } from '@/services/parents.service';
import { studentsService } from '@/services/students.service';
import type { ParentItem, ParentListParams, ParentRelation } from '@/types/parent';
import type { StudentListParams } from '@/types/student';
import { formatPhone } from '@/utils/format';
import { RelationFields } from './RelationFields';

interface PickerOption {
  id: string;
  title: string;
  subtitle: string;
}

interface LinkModalShellProps {
  title: string;
  description: string;
  searchLabel: string;
  searchHint: string;
  searchInput: string;
  onSearchChange: (value: string) => void;
  options: { pending: boolean; error: unknown; items: PickerOption[]; placeholder: boolean };
  onSave: (selectedId: string, relation: ParentRelation, isPrimary: boolean) => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  footerNote?: ReactNode;
}

/** Qidirib tanlash + qarindoshlik — ikkala yo‘nalish (ota-onaga farzand, o‘quvchiga ota-ona) uchun umumiy */
function LinkModalShell(props: LinkModalShellProps) {
  const [selected, setSelected] = useState<PickerOption | null>(null);
  const [relation, setRelation] = useState<ParentRelation>('GUARDIAN');
  const [isPrimary, setIsPrimary] = useState(false);
  const { options } = props;

  return (
    <Modal
      open
      title={props.title}
      description={props.description}
      onClose={props.onClose}
      closeDisabled={props.saving}
      footer={
        <>
          <Button variant="secondary" onClick={props.onClose} disabled={props.saving}>
            Bekor qilish
          </Button>
          <Button
            onClick={() => selected && props.onSave(selected.id, relation, isPrimary)}
            loading={props.saving}
            disabled={!selected}
          >
            Biriktirish
          </Button>
        </>
      }
    >
      {props.error && (
        <Alert tone="error" className="mb-4">
          {props.error}
        </Alert>
      )}

      {selected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg">{selected.title}</p>
              <p className="text-xs text-fg-muted">{selected.subtitle}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)} disabled={props.saving}>
              O‘zgartirish
            </Button>
          </div>
          <RelationFields
            idPrefix="link"
            relation={relation}
            isPrimary={isPrimary}
            onRelationChange={setRelation}
            onPrimaryChange={setIsPrimary}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <FormField label={props.searchLabel} htmlFor="link-search" hint={props.searchHint}>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <Input
                id="link-search"
                autoFocus
                value={props.searchInput}
                onChange={(event) => props.onSearchChange(event.target.value)}
                className="pl-9"
              />
            </div>
          </FormField>

          {options.pending ? (
            <p className="py-4 text-center text-sm text-fg-muted">Yuklanmoqda…</p>
          ) : options.error ? (
            <Alert tone="error">{getErrorMessage(options.error)}</Alert>
          ) : options.items.length === 0 ? (
            <p className="py-4 text-center text-sm text-fg-muted">Hech narsa topilmadi</p>
          ) : (
            <ul className={cn('divide-y divide-border rounded-xl border border-border', options.placeholder && 'opacity-60')}>
              {options.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="block w-full px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span className="block truncate text-sm font-medium text-fg">{item.title}</span>
                    <span className="block text-xs text-fg-muted">{item.subtitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {props.footerNote}
        </div>
      )}
    </Modal>
  );
}

interface LinkStudentModalProps {
  parent: ParentItem;
  onClose: () => void;
  onSaved: () => void;
}

/** Ota-onalar sahifasidan: ota-onaga farzand biriktirish */
export function LinkStudentModal({ parent, onClose, onSaved }: LinkStudentModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = useDebounce(searchInput.trim(), 400);
  const params: StudentListParams = { page: 1, limit: 8, ...(search ? { search } : {}) };
  const query = useQuery({
    queryKey: queryKeys.students.list(params),
    queryFn: () => studentsService.list(params),
    placeholderData: keepPreviousData,
  });
  const linked = new Set(parent.students.map((link) => link.studentId));

  const save = useMutation({
    mutationFn: (input: { studentId: string; relation: ParentRelation; isPrimary: boolean }) => parentsService.linkStudent(parent.id, input),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <LinkModalShell
      title="Farzand biriktirish"
      description={`${parent.firstName} ${parent.lastName} · ${formatPhone(parent.phone)}`}
      searchLabel="O‘quvchini qidiring"
      searchHint="Ism, telefon yoki ST-raqam"
      searchInput={searchInput}
      onSearchChange={setSearchInput}
      options={{
        pending: query.isPending,
        error: query.error,
        placeholder: query.isPlaceholderData,
        items: (query.data?.items ?? [])
          .filter((student) => !linked.has(student.id))
          .map((student) => ({
            id: student.id,
            title: `${student.firstName} ${student.lastName}`,
            subtitle: `${student.code} · ${student.course.name}${student.group ? ` · ${student.group.name}` : ''}`,
          })),
      }}
      onSave={(studentId, relation, isPrimary) => {
        setError(null);
        save.mutate({ studentId, relation, isPrimary });
      }}
      saving={save.isPending}
      error={error}
      onClose={onClose}
    />
  );
}

interface LinkParentModalProps {
  student: { id: string; name: string };
  linkedParentIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

/** O‘quvchi profilidan: mavjud ota-onani biriktirish (masalan, aka-uka o‘quvchilar) */
export function LinkParentModal({ student, linkedParentIds, onClose, onSaved }: LinkParentModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = useDebounce(searchInput.trim(), 400);
  const params: ParentListParams = { page: 1, limit: 8, ...(search ? { search } : {}) };
  const query = useQuery({
    queryKey: queryKeys.parents.list(params),
    queryFn: () => parentsService.list(params),
    placeholderData: keepPreviousData,
  });
  const linked = new Set(linkedParentIds);

  const save = useMutation({
    mutationFn: (input: { parentId: string; relation: ParentRelation; isPrimary: boolean }) =>
      parentsService.linkStudent(input.parentId, { studentId: student.id, relation: input.relation, isPrimary: input.isPrimary }),
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (mutationError) => setError(getErrorMessage(mutationError)),
  });

  return (
    <LinkModalShell
      title="Mavjud ota-onani biriktirish"
      description={student.name}
      searchLabel="Ota-onani qidiring"
      searchHint="Ism, telefon yoki farzandining ismi"
      searchInput={searchInput}
      onSearchChange={setSearchInput}
      options={{
        pending: query.isPending,
        error: query.error,
        placeholder: query.isPlaceholderData,
        items: (query.data?.items ?? [])
          .filter((parent) => !linked.has(parent.id))
          .map((parent) => ({
            id: parent.id,
            title: `${parent.firstName} ${parent.lastName}`,
            subtitle: `${formatPhone(parent.phone)}${
              parent.students.length ? ` · ${parent.students.map((link) => link.firstName).join(', ')}` : ''
            }`,
          })),
      }}
      onSave={(parentId, relation, isPrimary) => {
        setError(null);
        save.mutate({ parentId, relation, isPrimary });
      }}
      saving={save.isPending}
      error={error}
      onClose={onClose}
    />
  );
}
