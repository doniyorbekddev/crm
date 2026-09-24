import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { QrCode } from '@/components/QrCode';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageLoader } from '@/components/PageLoader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { queryKeys } from '@/lib/queryKeys';
import { certificatesService } from '@/services/certificates.service';
import { formatDate } from '@/utils/format';

/**
 * Chop etishga tayyor sertifikat (A4, albom yo'nalishi).
 *
 * PDF alohida kutubxona bilan yaratilmaydi: brauzerning "Chop etish → PDF sifatida saqlash"
 * imkoniyati aynan shu sahifani PDF qiladi. Shu tufayli hujjat ko'rinishi ekranda ham,
 * qog'ozda ham bir xil bo'ladi va loyihaga og'ir bog'liqlik qo'shilmaydi.
 *
 * `@media print` qoidalari: menyu va tugmalar chiqmaydi, ramka va ranglar saqlanadi.
 */
export default function CertificatePrintPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Sertifikat');

  const query = useQuery({
    queryKey: queryKeys.certificates.detail(id),
    queryFn: () => certificatesService.getById(id),
    enabled: id !== '',
  });

  if (query.isPending) return <PageLoader />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const certificate = query.data;
  const verifyUrl = `${window.location.origin}/verify/${certificate.verifyToken}`;

  return (
    <div className="min-h-screen bg-surface-muted p-4 print:bg-white print:p-0">
      {/* Chop etishda ko'rinmaydigan boshqaruv paneli */}
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-between gap-3 print:hidden">
        <Link to={`/students/${certificate.studentId}`} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden />
          O‘quvchi profiliga
        </Link>
        <Button leftIcon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
          Chop etish / PDF
        </Button>
      </div>

      <article className="mx-auto flex aspect-[297/210] w-full max-w-[297mm] flex-col justify-between border-[6px] border-brand-600 bg-white p-[8mm] text-slate-900 shadow-lg print:aspect-auto print:h-[200mm] print:w-full print:max-w-none print:border-[4px] print:shadow-none">
        <header className="text-center">
          <p className="text-xs tracking-[0.3em] text-slate-500 uppercase">{certificate.branchName ?? 'O‘quv markaz'}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-wide">SERTIFIKAT</h1>
          <p className="mt-1 text-sm text-slate-500">Kursni muvaffaqiyatli tamomlagani uchun</p>
        </header>

        <section className="text-center">
          <p className="text-sm text-slate-500">Ushbu sertifikat</p>
          <p className="mt-2 border-b border-slate-300 pb-2 text-3xl font-semibold">{certificate.studentName}</p>
          <p className="mt-3 text-sm text-slate-500">
            «{certificate.courseName}» kursini {formatDate(certificate.startDate)} — {formatDate(certificate.completionDate)} oralig‘ida
            tamomlaganini tasdiqlaydi
          </p>
          {(certificate.grade || certificate.percentage !== null) && (
            <p className="mt-3 text-base">
              Natija:{' '}
              <span className="font-semibold">
                {certificate.grade ?? '—'}
                {certificate.percentage === null ? '' : ` (${certificate.percentage}%)`}
              </span>
            </p>
          )}
        </section>

        <footer className="flex items-end justify-between gap-6">
          <div className="text-left text-xs text-slate-500">
            <p className="font-mono text-sm text-slate-700">{certificate.code}</p>
            <p className="mt-1">Berilgan sana: {formatDate(certificate.issuedAt)}</p>
            <p className="mt-3 w-48 border-t border-slate-400 pt-1">O‘qituvchi: {certificate.teacherName ?? '—'}</p>
          </div>

          <div className="text-center">
            <QrCode value={verifyUrl} size={96} />
            <p className="mt-1 text-[10px] text-slate-500">Haqiqiyligini tekshirish</p>
          </div>

          <div className="text-right text-xs text-slate-500">
            <p className="mt-3 w-48 border-t border-slate-400 pt-1">Direktor imzosi</p>
          </div>
        </footer>
      </article>

      <p className="mx-auto mt-3 max-w-[297mm] text-center text-xs text-fg-subtle print:hidden">
        Chop etish oynasida «Landscape (albom)» va «Background graphics» yoqilgan bo‘lsin.
      </p>
    </div>
  );
}
