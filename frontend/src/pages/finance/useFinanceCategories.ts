import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { normalizeOptionText } from '@/components/ui/optionList';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { expensesService, incomesService } from '@/services/finance.service';
import type { FinanceCategory } from '@/types/finance';

/**
 * Tushum/xarajat kategoriyalari: ro'yxat va nom bilan yangi kategoriya qo'shish.
 * Server yangilangan to'liq ro'yxatni qaytaradi — keshga shu yoziladi (qayta so'rov shart emas).
 */
export function useFinanceCategories(kind: 'income' | 'expense', { enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const service = kind === 'income' ? incomesService : expensesService;
  const queryKey = kind === 'income' ? queryKeys.incomes.categories : queryKeys.expenses.categories;

  const query = useQuery({ queryKey, queryFn: service.categories, staleTime: 60_000, enabled });

  const apply = (categories: FinanceCategory[]) => {
    queryClient.setQueryData(queryKey, categories);
    // Budjet va hisobotlar kategoriya ro'yxatini o'zi chiqaradi
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => service.createCategory({ name }),
    onSuccess: (result) => apply(result.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; isActive?: boolean; sortOrder?: number }) => service.updateCategory(id, payload),
    onSuccess: (result) => apply(result.data),
  });

  /** Yangi kategoriya id'si (formada darhol tanlash uchun). Xato bo'lsa toast va `throw` */
  const create = async (name: string): Promise<string | null> => {
    try {
      const result = await createMutation.mutateAsync(name);
      const created = result.data.find((category) => normalizeOptionText(category.name) === normalizeOptionText(name));
      toast.success(`“${created?.name ?? name}” kategoriyasi qo‘shildi`);
      return created?.id ?? null;
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  return { query, create, creating: createMutation.isPending, update: updateMutation };
}
