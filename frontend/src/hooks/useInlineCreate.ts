import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { lookupsService } from '@/services/lookups.service';

interface InlineCreateOptions {
  /** Faqat nom bilan yaratadi va yangi yozuvni qaytaradi */
  create: (name: string) => Promise<{ id: string; name: string }>;
  /** Shu ro'yxatlar yangilanadi (yangi band boshqa formalarda ham chiqsin) */
  invalidate: readonly QueryKey[];
  /** Toast: `“X” manbasi qo'shildi` */
  noun: string;
}

/**
 * Select ichidan yangi ma'lumotnoma yozuvi qo'shish (Combobox `onCreate`).
 * Muvaffaqiyatda yangi id qaytadi (darhol tanlanadi); xatoda toast va `throw` — ro'yxat ochiq qoladi.
 */
export function useInlineCreate({ create, invalidate, noun }: InlineCreateOptions) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: create });

  return async (name: string): Promise<string | null> => {
    try {
      const created = await mutation.mutateAsync(name);
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(`“${created.name}” ${noun} qo‘shildi`);
      return created.id;
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };
}

/** Lead manbasi / reklama kanali: lead formasi va reklama xarajati bir xil ro'yxatdan foydalanadi */
export function useCreateSource() {
  return useInlineCreate({
    create: lookupsService.createSource,
    invalidate: [queryKeys.lookups.leadForm, queryKeys.lookups.marketingSources],
    noun: 'manbasi',
  });
}
