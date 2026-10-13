import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { queryKeys } from '@/lib/queryKeys';
import { branchesService } from '@/services/branches.service';
import { useBranchStore } from '@/store/branch.store';

/**
 * Filial tanlash. Bitta filial bo'lsa (yoki xodim faqat bittasini ko'rsa) umuman
 * ko'rinmaydi — bir filialli markaz uchun interfeys o'zgarmaydi.
 *
 * Tanlov ro'yxat so'rovlariga `branchId` bo'lib ketadi; ruxsatni baribir backend tekshiradi.
 */
export function BranchSelect() {
  const branchId = useBranchStore((state) => state.branchId);
  const setBranchId = useBranchStore((state) => state.setBranchId);

  const query = useQuery({
    queryKey: queryKeys.branches.list,
    queryFn: branchesService.list,
    staleTime: 5 * 60_000,
  });

  const branches = (query.data ?? []).filter((branch) => branch.isActive || branch.id === branchId);
  if (branches.length < 2) return null;

  return (
    <label className="hidden items-center gap-2 sm:flex">
      <Building2 className="size-4 text-fg-subtle" aria-hidden />
      <span className="sr-only">Filial</span>
      <Select
        value={branchId ?? ''}
        onChange={(event) => setBranchId(event.target.value || null)}
        aria-label="Filial"
        wrapperClassName="max-w-44"
        className="h-9"
      >
        <option value="">Barcha filiallar</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
