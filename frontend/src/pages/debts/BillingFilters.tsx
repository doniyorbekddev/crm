import { useQuery } from '@tanstack/react-query';
import { FilterBar, FilterField } from '@/components/ui/FilterBar';
import { Select } from '@/components/ui/Select';
import { queryKeys } from '@/lib/queryKeys';
import { paymentsService } from '@/services/payments.service';
import type { BillingFilterParams } from '@/types/billing';

export interface BillingFilterState {
  search: string;
  courseId: string;
  groupId: string;
  teacherId: string;
  amount: AmountRange;
}

export const EMPTY_BILLING_FILTERS: BillingFilterState = { search: '', courseId: '', groupId: '', teacherId: '', amount: 'all' };

type AmountRangeKey = 'all' | 'upto500k' | '500k-1m' | '1m-plus';

const AMOUNT_RANGES: Record<AmountRangeKey, { label: string; min?: number; max?: number }> = {
  all: { label: 'Har qanday summa' },
  upto500k: { label: '500 ming gacha', max: 500_000 },
  '500k-1m': { label: '500 ming – 1 mln', min: 500_001, max: 1_000_000 },
  '1m-plus': { label: '1 mln dan ortiq', min: 1_000_001 },
};

export type AmountRange = AmountRangeKey;

/** Filtr holati → API parametrlari (qidiruv debounce qilingan qiymat bilan) */
export function toBillingParams(state: BillingFilterState, search: string): BillingFilterParams {
  const range = AMOUNT_RANGES[state.amount];
  return {
    ...(search ? { search } : {}),
    ...(state.courseId ? { courseId: state.courseId } : {}),
    ...(state.groupId ? { groupId: state.groupId } : {}),
    ...(state.teacherId ? { teacherId: state.teacherId } : {}),
    ...(range.min !== undefined ? { minAmount: range.min } : {}),
    ...(range.max !== undefined ? { maxAmount: range.max } : {}),
  };
}

interface BillingFiltersProps {
  value: BillingFilterState;
  onChange: (next: BillingFilterState) => void;
  amountLabel: string;
}

/** Qarzdorlik ko'rinishlari uchun umumiy filtrlar: qidiruv, kurs, guruh, o'qituvchi, summa */
export function BillingFilters({ value, onChange, amountLabel }: BillingFiltersProps) {
  const lookupsQuery = useQuery({
    queryKey: queryKeys.lookups.paymentForm,
    queryFn: paymentsService.formLookups,
    staleTime: 5 * 60_000,
  });
  const groups = (lookupsQuery.data?.groups ?? []).filter((group) => !value.courseId || group.courseId === value.courseId);
  const set = (patch: Partial<BillingFilterState>) => onChange({ ...value, ...patch });

  return (
    <FilterBar
      search={{ value: value.search, onChange: (search) => set({ search }), placeholder: 'Ism, telefon yoki ST-raqam' }}
      activeCount={[value.courseId, value.groupId, value.teacherId].filter(Boolean).length + Number(value.amount !== 'all')}
      onClear={() => onChange({ ...EMPTY_BILLING_FILTERS, search: value.search })}
    >
      <FilterField className="sm:w-48">
        <Select value={value.courseId} onChange={(event) => set({ courseId: event.target.value, groupId: '' })} aria-label="Kurs">
          <option value="">Barcha kurslar</option>
          {lookupsQuery.data?.courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField className="sm:w-48">
        <Select value={value.groupId} onChange={(event) => set({ groupId: event.target.value })} aria-label="Guruh">
          <option value="">Barcha guruhlar</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField className="sm:w-48">
        <Select value={value.teacherId} onChange={(event) => set({ teacherId: event.target.value })} aria-label="O‘qituvchi">
          <option value="">Barcha o‘qituvchilar</option>
          {lookupsQuery.data?.teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.firstName} {teacher.lastName}
            </option>
          ))}
        </Select>
      </FilterField>
      <FilterField className="sm:w-44">
        <Select value={value.amount} onChange={(event) => set({ amount: event.target.value as AmountRange })} aria-label={amountLabel}>
          {(Object.keys(AMOUNT_RANGES) as AmountRange[]).map((key) => (
            <option key={key} value={key}>
              {AMOUNT_RANGES[key].label}
            </option>
          ))}
        </Select>
      </FilterField>
    </FilterBar>
  );
}
