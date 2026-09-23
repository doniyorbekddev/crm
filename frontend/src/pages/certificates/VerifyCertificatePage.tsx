import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ShieldX } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BrandMark } from '@/components/BrandMark';
import { PageLoader } from '@/components/PageLoader';
import { QrCode } from '@/components/QrCode';
import { Badge } from '@/components/ui/Badge';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { queryKeys } from '@/lib/queryKeys';
import { certificatesService } from '@/services/certificates.service';
import { formatDate } from '@/utils/format';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}

/**
 * Sertifikatni ochiq tekshirish sahifasi — kirish talab qilinmaydi.
 * Faqat hujjatni tasdiqlash uchun zarur ma'lumot ko'rsatiladi.
 */
export default function VerifyCertificatePage() {
  useDocumentTitle('Sertifikatni tekshirish');
  const { token = '' } = useParams();

  const query = useQuery({
    queryKey: queryKeys.certificates.verify(token),
    queryFn: () => certificatesService.verify(token),
    retry: false,
  });

  return (
    <div className="min-h-dvh bg-app px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>

        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <ShieldX className="mx-auto size-10 text-red-500" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold text-fg">Sertifikat topilmadi</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Kod noto‘g‘ri yoki bunday sertifikat berilmagan. Havolani qaytadan tekshiring.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col items-center text-center">
              {query.data.valid ? (
                <BadgeCheck className="size-12 text-emerald-500" aria-hidden />
              ) : (
                <ShieldX className="size-12 text-red-500" aria-hidden />
              )}
              <h1 className="mt-3 text-xl font-semibold text-fg">
                {query.data.valid ? 'Sertifikat haqiqiy' : 'Sertifikat bekor qilingan'}
              </h1>
              <Badge tone={query.data.valid ? 'green' : 'red'} className="mt-2">
                {query.data.code}
              </Badge>
            </div>

            <div className="mt-6">
              <Row label="Egasi" value={query.data.studentName} />
              <Row label="Kurs" value={query.data.courseName} />
              {query.data.teacherName && <Row label="O‘qituvchi" value={query.data.teacherName} />}
              <Row label="Tugatgan sana" value={formatDate(query.data.completionDate)} />
              {query.data.grade && <Row label="Baho" value={query.data.grade} />}
              <Row label="Berilgan sana" value={formatDate(query.data.issuedAt)} />
              {query.data.revokedAt && <Row label="Bekor qilingan" value={formatDate(query.data.revokedAt)} />}
            </div>

            <div className="mt-6 flex flex-col items-center gap-2">
              <QrCode value={window.location.href} size={120} />
              <p className="text-xs text-fg-subtle">Shu sahifaning QR kodi</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
