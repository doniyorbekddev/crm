import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import type { LeadFilters, LeadFollowUpFilter, LeadFormLookups, LeadPriority } from '@/types/lead';
import { LEAD_PRIORITY_LABELS, LEAD_PRIORITY_ORDER } from '@/utils/leadLabels';

export interface LeadFilterState {
  search: string;
  sourceId: string;
  courseId: string;
  assignedTo: string;
  priority: '' | LeadPriority;
  followUp: '' | LeadFollowUpFilter;
}

export const EMPTY_LEAD_FILTERS: LeadFilterState = {
  search: '',
  sourceId: '',
  courseId: '',
  assignedTo: '',
  priority: '',
  followUp: '',
};

/** Forma holatini API parametrlariga o‘giradi (bo‘sh qiymatlar yuborilmaydi). */
export function toLeadFilters(state: LeadFilterState, debouncedSearch: string): LeadFilters {
  return {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(state.sourceId ? { sourceId: state.sourceId } : {}),
    ...(state.courseId ? { courseId: state.courseId } : {}),
    ...(state.assignedTo ? { assignedTo: state.assignedTo } : {}),
    ...(state.priority ? { priority: state.priority } : {}),
    ...(state.followUp ? { followUp: state.followUp } : {}),
  };
}

const FOLLOW_UP_OPTIONS: ReadonlyArray<{ value: LeadFollowUpFilter; label: string }> = [
  { value: 'overdue', label: 'Kechikkan' },
  { value: 'today', label: 'Bugun' },
  { value: 'upcoming', label: 'Rejalashtirilgan' },
  { value: 'none', label: 'Belgilanmagan' },
];

interface LeadFiltersBarProps {
  value: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
  lookups: LeadFormLookups | undefined;
  canViewAll: boolean;
}

export function LeadFiltersBar({ value, onChange, lookups, canViewAll }: LeadFiltersBarProps) {
  const set = <K extends keyof LeadFilterState>(key: K, next: LeadFilterState[K]) => onChange({ ...value, [key]: next });
  const hasFilters = Object.values(value).some((item) => item !== '');

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-xs lg:flex-row lg:items-center">
      <SearchInput
        value={value.search}
        onChange={(next) => set('search', next)}
        placeholder="Ism, telefon, telegram yoki L-000123"
        className="lg:max-w-xs"
      />
      <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-5">
        <Select value={value.sourceId} onChange={(event) => set('sourceId', event.target.value)} aria-label="Manba">
          <option value="">Barcha manbalar</option>
          {lookups?.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </Select>
        <Select value={value.courseId} onChange={(event) => set('courseId', event.target.value)} aria-label="Kurs">
          <option value="">Barcha kurslar</option>
          {lookups?.courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
        <Select value={value.assignedTo} onChange={(event) => set('assignedTo', event.target.value)} aria-label="Mas’ul xodim">
          <option value="">Barcha mas’ullar</option>
          <option value="me">Menga biriktirilgan</option>
          <option value="unassigned">Biriktirilmagan</option>
          {canViewAll &&
            lookups?.managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.firstName} {manager.lastName}
              </option>
            ))}
        </Select>
        <Select value={value.priority} onChange={(event) => set('priority', event.target.value as LeadFilterState['priority'])} aria-label="Muhimlik">
          <option value="">Barcha muhimlik</option>
          {LEAD_PRIORITY_ORDER.map((priority) => (
            <option key={priority} value={priority}>
              {LEAD_PRIORITY_LABELS[priority]}
            </option>
          ))}
        </Select>
        <Select value={value.followUp} onChange={(event) => set('followUp', event.target.value as LeadFilterState['followUp'])} aria-label="Keyingi aloqa">
          <option value="">Keyingi aloqa: barchasi</option>
          {FOLLOW_UP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" leftIcon={<X className="size-4" aria-hidden />} onClick={() => onChange(EMPTY_LEAD_FILTERS)}>
          Tozalash
        </Button>
      )}
    </div>
  );
}
