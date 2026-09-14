import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { preferencesService } from '@/services/preferences.service';
import type { PreferenceKey } from '@/services/preferences.service';

type PreferenceMap = Partial<Record<PreferenceKey, unknown>>;

/**
 * Bazada saqlanadigan shaxsiy sozlama. O‘zgarish darhol ekranga chiqadi (optimistik),
 * saqlab bo‘lmasa oldingi qiymatga qaytadi.
 */
export function usePreference<T>(key: PreferenceKey, parse: (value: unknown) => T | null) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.preferences, queryFn: preferencesService.list, staleTime: Infinity });

  const mutation = useMutation({
    mutationFn: (value: T) => preferencesService.save(key, value),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.preferences });
      const previous = queryClient.getQueryData<PreferenceMap>(queryKeys.preferences);
      queryClient.setQueryData<PreferenceMap>(queryKeys.preferences, { ...(previous ?? {}), [key]: value });
      return { previous };
    },
    onError: (error, _value, context) => {
      queryClient.setQueryData(queryKeys.preferences, context?.previous);
      toast.error(getErrorMessage(error));
    },
  });

  return {
    value: query.data ? parse(query.data[key]) : null,
    loaded: query.isSuccess,
    save: mutation.mutate,
  };
}
