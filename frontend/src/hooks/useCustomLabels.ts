import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { lookupsService } from '@/services/lookups.service';
import type { CustomLabelField } from '@/services/lookups.service';

/** Formadagi "o'zim yozaman" maydoni uchun takliflar. Xato bo'lsa jim — maydon takliflarsiz ham ishlaydi */
export function useCustomLabels(field: CustomLabelField, enabled = true): string[] {
  const query = useQuery({
    queryKey: queryKeys.lookups.customLabels(field),
    queryFn: () => lookupsService.customLabels(field),
    // Forma har ochilganda yangi saqlangan nomlar ham chiqsin (so'rov yengil: bitta groupBy).
    // Kesh darhol ko'rsatiladi, yangilangani ustidan yoziladi
    refetchOnMount: 'always',
    enabled,
  });
  return query.data ?? [];
}
