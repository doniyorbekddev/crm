import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Coffee, LogIn, LogOut, QrCode, TimerReset, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { staffAttendanceService } from '@/services/staffAttendance.service';
import type { ScanResult, StaffAction } from '@/types/staffAttendance';
import { STAFF_ACTION_LABELS } from '@/utils/staffAttendanceLabels';

const ACTION_ICONS: Record<StaffAction, LucideIcon> = {
  CHECK_IN: LogIn,
  BREAK_START: Coffee,
  BREAK_END: Undo2,
  CHECK_OUT: LogOut,
};

/** QR muammosi kodi (backend `errors[0].message`) */
function qrProblem(error: unknown): 'EXPIRED' | 'USED' | 'INVALID' | null {
  const code = getFieldErrors(error).find((item) => item.field === 'qr')?.message;
  return code === 'EXPIRED' || code === 'USED' || code === 'INVALID' ? code : null;
}

const PROBLEM_TEXT = {
  EXPIRED: { title: 'QR kod muddati tugagan', text: 'Ekrandagi QR kod yangilandi. Yangisini skanerlang.' },
  USED: { title: 'QR kod allaqachon ishlatilgan', text: 'Har QR kod bir marta ishlaydi. Ekrandagi yangisini skanerlang.' },
  INVALID: { title: 'QR kod tanilmadi', text: 'Qabulxonadagi davomat ekranidagi QR kodni skanerlang.' },
} as const;

/**
 * Skanerlangan QR bo'yicha amalni tasdiqlash. QR avval **sarflanmasdan** tekshiriladi (qaysi amallar mumkin),
 * xodim amalni tanlaganda server tokenni bir martalik qilib ishlatadi. Vaqtni server qo'yadi.
 */
export function ScanSheet({ token, onClose, onRescan }: { token: string; onClose: () => void; onRescan: () => void }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const preview = useQuery({
    queryKey: ['staff-attendance', 'preview', token],
    queryFn: () => staffAttendanceService.preview(token),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const scan = useMutation({
    mutationFn: (action: StaffAction) => staffAttendanceService.scan(token, action),
    onSuccess: (data) => {
      setResult(data);
      queryClient.setQueryData(queryKeys.staffAttendance.today, data.today);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffAttendance.all });
    },
  });

  const secondsLeft = preview.data ? Math.max(0, Math.ceil((Date.parse(preview.data.expiresAt) - now) / 1000)) : null;
  const problem = qrProblem(scan.error) ?? qrProblem(preview.error) ?? (secondsLeft === 0 && !result ? 'EXPIRED' : null);

  return (
    <Modal open onClose={onClose} title={result ? 'Qayd etildi' : 'Davomatni belgilash'} closeDisabled={scan.isPending} size="sm">
      {result ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <p className="text-h4 font-semibold text-fg">{result.message}</p>
          {result.today.day.arrival === 'LATE' && result.action === 'CHECK_IN' && (
            <p className="text-body text-warning">Kechikish: {result.today.day.lateMinutes} daqiqa</p>
          )}
          <Button onClick={onClose} className="mt-2 w-full">
            Yopish
          </Button>
        </div>
      ) : problem ? (
        <div className="space-y-4">
          <Alert tone="warning" title={PROBLEM_TEXT[problem].title}>
            {PROBLEM_TEXT[problem].text}
          </Alert>
          <Button onClick={onRescan} leftIcon={<QrCode className="size-4" aria-hidden />} className="w-full">
            Qayta skanerlash
          </Button>
        </div>
      ) : preview.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : preview.isError || scan.isError ? (
        <div className="space-y-4">
          <Alert tone="error">{getErrorMessage(scan.error ?? preview.error)}</Alert>
          <Button variant="secondary" onClick={onClose} className="w-full">
            Yopish
          </Button>
        </div>
      ) : preview.data.actions.length === 0 ? (
        <Alert tone="info" title="Bugungi ish kuni yakunlangan">
          Ishdan ketganingiz allaqachon qayd etilgan.
        </Alert>
      ) : (
        <div className="space-y-3">
          <p className="text-body text-fg-muted">Nima qilyapsiz?</p>
          {preview.data.actions.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <Button
                key={action}
                size="lg"
                variant={action === 'CHECK_IN' || action === 'BREAK_END' ? 'primary' : 'secondary'}
                className="w-full justify-start"
                leftIcon={<Icon className="size-5" aria-hidden />}
                loading={scan.isPending && scan.variables === action}
                disabled={scan.isPending}
                onClick={() => scan.mutate(action)}
              >
                {STAFF_ACTION_LABELS[action]}
              </Button>
            );
          })}
          {secondsLeft !== null && (
            <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
              <TimerReset className="size-3.5" aria-hidden />
              QR yana {secondsLeft} soniya amal qiladi
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
