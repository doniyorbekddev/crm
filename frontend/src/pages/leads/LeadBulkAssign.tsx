import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { leadsService } from '@/services/leads.service';
import { lookupsService } from '@/services/lookups.service';

/** Tanlangan leadlarni bitta xodimga biriktirish. Rad etilganlari bo'lsa — soni va birinchi sabab ko'rsatiladi. */
export function LeadBulkAssign({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [assignee, setAssignee] = useState('');
  const lookupsQuery = useQuery({ queryKey: queryKeys.lookups.leadForm, queryFn: lookupsService.leadForm, staleTime: 5 * 60_000 });

  const assign = useMutation({
    mutationFn: () => leadsService.bulkAssign(ids, assignee === 'NONE' ? null : assignee),
    onSuccess: (result) => {
      const { failed } = result.data;
      if (failed.length === 0) toast.success(result.message);
      else toast.warning(result.message, { description: failed[0]!.message });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      onDone();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <>
      <Select value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Mas’ul xodim" wrapperClassName="w-52" disabled={assign.isPending}>
        <option value="">Mas’ul xodimni tanlang</option>
        <option value="NONE">Biriktirilmagan</option>
        {(lookupsQuery.data?.managers ?? []).map((manager) => (
          <option key={manager.id} value={manager.id}>
            {manager.firstName} {manager.lastName}
          </option>
        ))}
      </Select>
      <Button size="sm" leftIcon={<UserCheck className="size-4" aria-hidden />} disabled={!assignee} loading={assign.isPending} onClick={() => assign.mutate()}>
        Biriktirish
      </Button>
    </>
  );
}
