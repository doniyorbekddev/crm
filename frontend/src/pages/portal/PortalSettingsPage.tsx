import { Bell, Palette } from 'lucide-react';
import { useState } from 'react';
import { ChangePasswordCard } from '@/components/ChangePasswordCard';
import { PageHeader } from '@/components/PageHeader';
import { TelegramLinkCard } from '@/components/TelegramLinkCard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { NotificationSettingsModal } from '@/pages/notifications/NotificationSettingsModal';

/**
 * Kabinet sozlamalari: parol, bildirishnomalar, Telegram, mavzu.
 * Hammasi mavjud endpointlar — xodim profili bilan bir xil servislar.
 */
export default function PortalSettingsPage() {
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div>
      <PageHeader title="Sozlamalar" description="Hisob xavfsizligi, bildirishnomalar va ko‘rinish" />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <ChangePasswordCard />

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="size-4 text-fg-muted" aria-hidden />
                  Bildirishnomalar
                </CardTitle>
                <CardDescription>Qaysi xabarlar ilovada va Telegramda kelishini tanlang</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" onClick={() => setNotificationsOpen(true)}>
                Sozlash
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="size-4 text-fg-muted" aria-hidden />
                  Ko‘rinish
                </CardTitle>
                <CardDescription>Yorug‘, qorong‘i yoki qurilma sozlamasi</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ThemeToggle />
            </CardContent>
          </Card>
        </div>

        <TelegramLinkCard audience="portal" />
      </div>

      {notificationsOpen && <NotificationSettingsModal onClose={() => setNotificationsOpen(false)} />}
    </div>
  );
}
