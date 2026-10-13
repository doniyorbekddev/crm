import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { getErrorMessage } from '@/lib/api';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { AVATAR_ACCEPT, AvatarImageError, prepareAvatar } from '@/utils/avatarImage';

/** Joriy foydalanuvchining profil rasmi: yuklash, almashtirish, o'chirish */
export function AvatarUploader() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const input = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => authService.uploadAvatar(await prepareAvatar(file)),
    onSuccess: (result) => {
      const current = useAuthStore.getState().user;
      if (current) setUser({ ...current, avatarUrl: result.data.avatarUrl });
      toast.success(result.message);
    },
    onError: (error) => toast.error(error instanceof AvatarImageError ? error.message : getErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => authService.removeAvatar(),
    onSuccess: (message) => {
      const current = useAuthStore.getState().user;
      if (current) setUser({ ...current, avatarUrl: null });
      toast.success(message);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!user) return null;
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar firstName={user.firstName} lastName={user.lastName} src={user.avatarUrl} size="xl" />
      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        className="sr-only"
        aria-label="Profil rasmi fayli"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Bir xil faylni qayta tanlash ham ishlasin
          event.target.value = '';
          if (file) upload.mutate(file);
        }}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" leftIcon={<Camera className="size-4" aria-hidden />} loading={upload.isPending} disabled={busy} onClick={() => input.current?.click()}>
          {user.avatarUrl ? 'Rasmni almashtirish' : 'Rasm yuklash'}
        </Button>
        {user.avatarUrl && (
          <Button size="sm" variant="ghost" leftIcon={<Trash2 className="size-4" aria-hidden />} loading={remove.isPending} disabled={busy} onClick={() => remove.mutate()}>
            O‘chirish
          </Button>
        )}
      </div>
      <p className="text-caption text-fg-subtle">JPG, PNG yoki WEBP. Rasm kvadrat qilib qirqiladi.</p>
    </div>
  );
}
