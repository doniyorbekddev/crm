import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { roomsService } from '@/services/rooms.service';
import type { Room } from '@/types/room';
import { WEEK_DAY_LABELS } from '@/utils/courseLabels';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { RoomFormModal } from './RoomFormModal';

function GroupSchedule({ room }: { room: Room }) {
  if (room.groups.length === 0) {
    return <p className="text-sm text-fg-subtle">Band qilinmagan</p>;
  }
  return (
    <ul className="space-y-1">
      {room.groups.map((group) => (
        <li key={group.id} className="text-sm text-fg-muted">
          <span className="text-fg">{group.name}</span> ·{' '}
          {group.scheduleDays.map((day) => WEEK_DAY_LABELS[day].slice(0, 3)).join(', ')} · {group.startTime}–{group.endTime}
        </li>
      ))}
    </ul>
  );
}

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.GROUP_MANAGE);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialog, setDialog] = useState<{ room?: Room } | null>(null);

  const roomsQuery = useQuery({
    queryKey: queryKeys.rooms.list(includeInactive),
    queryFn: () => roomsService.list(includeInactive),
  });

  const toggleActive = useMutation({
    mutationFn: (room: Room) => roomsService.update(room.id, { name: room.name, capacity: room.capacity, isActive: !room.isActive }),
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <>
      <PageHeader
        title="Xonalar"
        documentTitle="Xonalar"
        description="O‘quv xonalari, sig‘imi va band qilish jadvali"
        actions={
          canManage && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({})}>
              Xona qo‘shish
            </Button>
          )
        }
      />

      <label className="mb-4 flex w-fit items-center gap-2 text-sm text-fg-muted">
        <Checkbox checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
        Faol bo‘lmaganlarni ham ko‘rsatish
      </label>

      {roomsQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : roomsQuery.isError ? (
        <ErrorState error={roomsQuery.error} onRetry={() => void roomsQuery.refetch()} />
      ) : roomsQuery.data.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="Xona qo‘shilmagan"
          description="Xonalarni qo‘shsangiz, guruh jadvalida band qilish to‘qnashuvi avtomatik tekshiriladi."
          action={canManage ? <Button onClick={() => setDialog({})}>Xona qo‘shish</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roomsQuery.data.map((room) => (
            <Card key={room.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">{room.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {room.key} · {room.capacity} o‘rin
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!room.isActive && <Badge tone="gray">Faol emas</Badge>}
                    {canManage && (
                      <Button
                        variant="ghost"
                        aria-label={`${room.name} — tahrirlash`}
                        onClick={() => setDialog({ room })}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>

                {room.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {room.equipment.map((item) => (
                      <Badge key={item} tone="blue">
                        {item}
                      </Badge>
                    ))}
                  </div>
                )}

                <GroupSchedule room={room} />

                {canManage && (
                  <Button
                    variant="secondary"
                    onClick={() => toggleActive.mutate(room)}
                    loading={toggleActive.isPending && toggleActive.variables?.id === room.id}
                  >
                    {room.isActive ? 'Faoliyatdan chiqarish' : 'Qayta faollashtirish'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog && (
        <RoomFormModal
          room={dialog.room}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.rooms.all });
          }}
        />
      )}
    </>
  );
}
