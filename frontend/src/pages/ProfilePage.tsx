import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { PageHeader } from '@/components/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TelegramLinkCard } from '@/components/TelegramLinkCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { getErrorMessage } from '@/lib/api';
import { broadcastLogout } from '@/lib/authChannel';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { formatDateTime } from '@/utils/format';
import { groupPermissions } from '@/utils/permissions';

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
