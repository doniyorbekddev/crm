import { CheckCircle2, Expand, LogIn, QrCode as QrIcon, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode } from '@/components/QrCode';
import { ForbiddenState } from '@/components/ForbiddenState';
import { Button } from '@/components/ui/Button';
import { getErrorStatus } from '@/lib/api';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { QrIssue } from '@/types/staffAttendance';
import { qrLink, tashkentTime } from '@/utils/staffAttendanceLabels';

const STATUS_POLL_MS = 2_500;
const RETRY_MS = 5_000;

const DATE_TEXT = new Intl.DateTimeFormat('uz-Latn-UZ', { timeZone: 'Asia/Tashkent', weekday: 'long', day: 'numeric', month: 'long' });

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/**
 * Qabulxona ekrani (planshet yoki monitor). QR har `rotateSeconds` da va **har ishlatilishida** yangilanadi:
 * token bir martalik, shuning uchun navbatdagi xodim darhol yangi QR'ni ko'radi. QR ichida faqat havola va
 * token — xodim ma'lumoti yo'q. Ekran kim skanerlaganini ko'rsatmaydi.
 */
export default function ReceptionQrPage() {
  const [qr, setQr] = useState<QrIssue | null>(null);
  const [issuedAt, setIssuedAt] = useState(0);
  const [online, setOnline] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [flash, setFlash] = useState(false);
  /** Muvaffaqiyatsiz urinishlar — har biri qayta urinishni rejalashtiradi */
  const [failures, setFailures] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const loading = useRef(false);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const next = await staffAttendanceService.issueQr();
      setQr(next);
      setIssuedAt(Date.now());
      setOnline(true);
    } catch (error) {
      if (getErrorStatus(error) === 403) setForbidden(true);
      setOnline(false);
      setFailures((count) => count + 1);
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  // Birinchi QR, muddat tugaganda yangisi; aloqa uzilgan bo'lsa — qayta urinish
  const elapsed = qr ? (now - issuedAt) / 1000 : 0;
  const rotateIn = qr ? Math.max(0, Math.ceil(qr.rotateSeconds - elapsed)) : 0;
  useEffect(() => {
    if (forbidden) return undefined;
    if (!qr || rotateIn === 0) {
      const timer = window.setTimeout(() => void refresh(), failures > 0 && !online ? RETRY_MS : 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [qr, rotateIn, online, failures, forbidden, refresh]);

  // QR ishlatilishi bilan — tasdiq belgisi va yangi QR
  useEffect(() => {
    if (!qr) return undefined;
    const timer = window.setInterval(() => {
      staffAttendanceService
        .qrStatus(qr.id)
        .then((status) => {
          setOnline(true);
          if (status.used) {
            setFlash(true);
            window.setTimeout(() => setFlash(false), 1_500);
            void refresh();
          }
        })
        .catch(() => setOnline(false));
    }, STATUS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [qr, refresh]);

  // Ekran o'chib qolmasin (qo'llab-quvvatlansa)
  useEffect(() => {
    let lock: WakeLockSentinelLike | null = null;
    const wakeLock = (navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock;
    const request = () => {
      if (document.visibilityState === 'visible') void wakeLock?.request('screen').then((sentinel) => (lock = sentinel)).catch(() => undefined);
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (forbidden) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-4">
        <ForbiddenState />
      </div>
    );
  }

  const progress = qr ? Math.min(1, elapsed / qr.rotateSeconds) : 0;

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <h1 className="text-h3 font-semibold">Xodimlar davomati</h1>
          <p className="text-caption text-fg-subtle first-letter:uppercase">{DATE_TEXT.format(now)}</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-h2 font-semibold tabular-nums" aria-label="Hozirgi vaqt">
            {tashkentTime(new Date(now))}
          </p>
          <span
            role="status"
            className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium ${online ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}`}
          >
            {online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
            {online ? 'Ulangan' : 'Aloqa yo‘q'}
          </span>
          <Button variant="ghost" size="icon" aria-label="To‘liq ekran" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>
            <Expand className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <div className="grid flex-1 items-center gap-8 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative rounded-card border border-border bg-white p-4 shadow-sm sm:p-6">
            {qr ? (
              <QrCode value={qrLink(window.location.origin, qr.token)} size={480} className="h-auto w-[min(78vw,60vh,480px)]" />
            ) : (
              <div className="grid aspect-square w-[min(78vw,60vh,480px)] place-items-center text-fg-subtle">
                <QrIcon className="size-16 animate-pulse" aria-hidden />
              </div>
            )}
            {flash && (
              <div role="status" className="absolute inset-0 grid place-items-center rounded-card bg-white/95">
                <div className="flex flex-col items-center gap-2 text-success">
                  <CheckCircle2 className="size-20" aria-hidden />
                  <p className="text-h3 font-semibold">Qayd etildi</p>
                </div>
              </div>
            )}
          </div>
          <div className="w-[min(78vw,60vh,480px)] space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-muted" aria-hidden>
              <div className="h-full rounded-pill bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${(1 - progress) * 100}%` }} />
            </div>
            <p className="text-center text-caption text-fg-subtle" aria-live="polite">
              {qr ? `QR ${rotateIn} soniyadan keyin yangilanadi` : online ? 'QR kod tayyorlanmoqda…' : 'Server bilan aloqa yo‘q — qayta ulanmoqda…'}
            </p>
          </div>
        </div>

        <ol className="space-y-4">
          {[
            { icon: Smartphone, title: 'Telefoningizda CRM hisobingizga kiring', text: 'Har kim faqat o‘z hisobi bilan belgilaydi.' },
            { icon: QrIcon, title: 'QR kodni skanerlang', text: 'Telefon kamerasi yoki “Davomatim” sahifasidagi “QR kodni skanerlash” tugmasi.' },
            { icon: LogIn, title: 'Amalni tanlang', text: 'Ishga keldim, tanaffusga chiqdim, tanaffusdan qaytdim yoki ishdan ketdim.' },
          ].map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex gap-3 rounded-card border border-border bg-surface p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-subtle text-primary">
                <Icon className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-body font-semibold">
                  {index + 1}. {title}
                </p>
                <p className="text-caption text-fg-muted">{text}</p>
              </div>
            </li>
          ))}
          <li className="text-caption text-fg-subtle">QR kod bir martalik va qisqa muddatli — rasmga olib boshqaga yuborish ishlamaydi.</li>
        </ol>
      </div>
    </main>
  );
}
