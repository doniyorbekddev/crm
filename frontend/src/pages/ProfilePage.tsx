import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader } from '@/components/PageHeader';
import { PasswordRequirements } from '@/components/PasswordRequirements';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TelegramLinkCard } from '@/components/TelegramLinkCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField, fieldErrorId } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { getErrorMessage } from '@/lib/api';
import { broadcastLogout } from '@/lib/authChannel';
import { applyFieldErrors } from '@/lib/forms';
import { newPasswordField } from '@/lib/validation';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { formatDateTime } from '@/utils/format';
import { groupPermissions } from '@/utils/permissions';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Joriy parolni kiriting'),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, 'Parolni takrorlang'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Parollar bir xil emas',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'Yangi parol joriy paroldan farq qilishi kerak',
  });

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-fg-subtle">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-fg-muted">{label}</dt>
        <dd className="truncate text-sm font-medium text-fg">{value}</dd>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const setSession = useAuthStore((state) => state.setSession);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' });

  const change = useMutation({
    mutationFn: authService.changePassword,
    onSuccess: (result) => {
      setSession(result.data);
      reset();
      toast.success(result.message);
    },
    onError: (error) => {
      if (!applyFieldErrors(error, setError, ['currentPassword', 'newPassword'])) {
        setFormError(getErrorMessage(error));
      }
    },
  });

  const onSubmit = handleSubmit(({ currentPassword, newPassword }) => {
    setFormError(null);
    change.mutate({ currentPassword, newPassword });
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-fg-muted" aria-hidden />
            Parolni o‘zgartirish
          </CardTitle>
          <CardDescription>O‘zgartirilgach, boshqa qurilmalardagi sessiyalar yopiladi</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {formError && (
          <Alert tone="error" className="mb-4">
            {formError}
          </Alert>
        )}
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField label="Joriy parol" htmlFor="currentPassword" error={errors.currentPassword?.message}>
            <PasswordInput id="currentPassword" autoComplete="current-password" invalid={Boolean(errors.currentPassword)} aria-describedby={errors.currentPassword ? fieldErrorId('currentPassword') : undefined} {...register('currentPassword')} />
          </FormField>
          <FormField label="Yangi parol" htmlFor="newPassword" error={errors.newPassword?.message}>
            <PasswordInput id="newPassword" autoComplete="new-password" invalid={Boolean(errors.newPassword)} aria-describedby={errors.newPassword ? fieldErrorId('newPassword') : undefined} {...register('newPassword')} />
          </FormField>
          <PasswordRequirements value={newPassword} />
          <FormField label="Yangi parolni takrorlang" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
            <PasswordInput id="confirmPassword" autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? fieldErrorId('confirmPassword') : undefined} {...register('confirmPassword')} />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" loading={change.isPending}>
              Parolni saqlash
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionsCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const logoutAll = useMutation({
    mutationFn: authService.logoutAll,
    onSuccess: (result) => {
      setConfirmOpen(false);
      navigate('/login', { replace: true });
      useAuthStore.getState().clearSession();
      queryClient.clear();
      broadcastLogout();
      toast.success(`${result.revokedSessions} ta sessiya yopildi`);
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error(getErrorMessage(error));
    },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="size-4 text-fg-muted" aria-hidden />
            Sessiyalar
          </CardTitle>
          <CardDescription>Telefon yoki boshqa kompyuterda hisobingiz ochiq qolgan bo‘lsa</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-md text-sm text-fg-muted">
          Barcha qurilmalardan, jumladan shu qurilmadan ham chiqasiz. Qaytadan kirish uchun parol kerak bo‘ladi.
        </p>
        <Button variant="danger" onClick={() => setConfirmOpen(true)}>
          Barcha qurilmalardan chiqish
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        title="Barcha qurilmalardan chiqilsinmi?"
        description="Hisobingiz ochiq bo‘lgan barcha brauzer va qurilmalardagi sessiyalar darhol yopiladi."
        confirmLabel="Ha, chiqish"
        loading={logoutAll.isPending}
        onConfirm={() => logoutAll.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;

  const permissionGroups = groupPermissions(user.permissions);

  return (
    <>
      <PageHeader title="Profil" description="Shaxsiy ma’lumotlar, ruxsatlar va xavfsizlik sozlamalari" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardContent className="flex flex-col items-center text-center">
              <Avatar firstName={user.firstName} lastName={user.lastName} size="lg" />
              <h2 className="mt-4 text-lg font-semibold">
                {user.firstName} {user.lastName}
              </h2>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Badge tone="blue">{user.role.name}</Badge>
                <Badge tone={user.status === 'ACTIVE' ? 'green' : 'yellow'}>
                  {user.status === 'ACTIVE' ? 'Faol' : user.status === 'PENDING' ? 'Tasdiqlanmagan' : 'Bloklangan'}
                </Badge>
              </div>
            </CardContent>
            <CardContent className="border-t border-border">
              <dl className="space-y-4">
                <InfoRow icon={<Mail className="size-4" aria-hidden />} label="Email" value={user.email} />
                <InfoRow icon={<Phone className="size-4" aria-hidden />} label="Telefon" value={user.phone ?? '—'} />
                <InfoRow icon={<ShieldCheck className="size-4" aria-hidden />} label="Oxirgi kirish" value={formatDateTime(user.lastLoginAt)} />
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-fg-muted" aria-hidden />
                  Ruxsatlar
                </CardTitle>
                <CardDescription>
                  «{user.role.name}» roli bo‘yicha {user.permissions.length} ta ruxsat
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {permissionGroups.length === 0 ? (
                <p className="text-sm text-fg-muted">Bu rolga hali hech qanday ruxsat berilmagan.</p>
              ) : (
                <dl className="divide-y divide-border">
                  {permissionGroups.map((group) => (
                    <div key={group.module} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                      <dt className="w-40 shrink-0 text-sm font-medium text-fg">{group.label}</dt>
                      <dd className="flex flex-wrap gap-1.5">
                        {group.actions.map((action) => (
                          <Badge key={action}>{action}</Badge>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          <TelegramLinkCard />
          <ChangePasswordCard />
          <SessionsCard />
        </div>
      </div>
    </>
  );
}
