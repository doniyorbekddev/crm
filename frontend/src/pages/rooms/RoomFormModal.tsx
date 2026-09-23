import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/lib/api';
import { roomsService } from '@/services/rooms.service';
import type { Room } from '@/types/room';

interface RoomFormModalProps {
  room?: Room;
  onClose: () => void;
  onSaved: () => void;
}

export function RoomFormModal({ room, onClose, onSaved }: RoomFormModalProps) {
  const [key, setKey] = useState(room?.key ?? '');
  const [name, setName] = useState(room?.name ?? '');
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 15));
  const [equipment, setEquipment] = useState((room?.equipment ?? []).join(', '));
  const [note, setNote] = useState(room?.note ?? '');
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        capacity: Number(capacity),
        equipment: equipment
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        note: note.trim() || undefined,
        isActive,
      };
      return room ? roomsService.update(room.id, payload) : roomsService.create({ ...payload, key: key.trim() });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const valid = name.trim().length > 0 && Number(capacity) >= 1 && (room || key.trim().length > 0);

  return (
    <Modal
      open
      title={room ? 'Xonani tahrirlash' : 'Xona qo‘shish'}
      description={room ? room.key : 'Guruh jadvali shu xonaga bog‘lanadi'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}
      <div className="space-y-4">
        {!room && (
          <FormField label="Kalit" htmlFor="room-key" hint="Qisqa belgi: A1, LAB2 — keyin o‘zgarmaydi">
            <Input id="room-key" value={key} placeholder="A1" onChange={(event) => setKey(event.target.value)} />
          </FormField>
        )}
        <FormField label="Nomi" htmlFor="room-name">
          <Input id="room-name" value={name} placeholder="A1 xona" onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Sig‘im" htmlFor="room-capacity" hint="Nechta o‘quvchi sig‘adi">
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={500}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </FormField>
        <FormField label="Jihozlar" htmlFor="room-equipment" hint="Vergul bilan ajrating: Proyektor, Doska">
          <Input
            id="room-equipment"
            value={equipment}
            placeholder="Proyektor, Doska"
            onChange={(event) => setEquipment(event.target.value)}
          />
        </FormField>
        <FormField label="Izoh" htmlFor="room-note">
          <Input id="room-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </FormField>
        {room && (
          <label className="flex items-center gap-2 text-sm text-fg">
            <Checkbox checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            Faol
          </label>
        )}
      </div>
    </Modal>
  );
}
