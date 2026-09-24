import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, ExternalLink, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QrCode } from '@/components/QrCode';
import { Badge } from '@/components/ui/Badge';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { certificatesService } from '@/services/certificates.service';
import { formatDate } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

/**
 * O'quvchining sertifikatlari. Berilgan hujjat o'chirilmaydi — faqat bekor qilinadi
 * (tekshiruv sahifasida "haqiqiy emas" deb ko'rinadi).
 */
export function CertificatesCard({ studentId }: { studentId: string }) {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.STUDENT_MANAGE);
  const [confirmIssue, setConfirmIssue] = useState(false);

  const params = { page: 1, limit: 10, studentId };
  const query = useQuery({
    queryKey: queryKeys.certificates.list(params),
    queryFn: () => certificatesService.list(params),
  });

  const issue = useMutation({
    mutationFn: () => certificatesService.issue({ studentId }),
    onSuccess: (result) => {
      toast.success(result.message);
      setConfirmIssue(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.certificates.all });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      setConfirmIssue(false);
    },
  });

  const verifyUrl = (token: string) => `${window.location.origin}/verify/${token}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sertifikatlar</CardTitle>
        {canManage && (
          <Button variant="secondary" leftIcon={<Award className="size-4" aria-hidden />} onClick={() => setConfirmIssue(true)}>
            Sertifikat berish
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">Hali sertifikat berilmagan.</p>
        ) : (
          <ul className="space-y-3">
            {query.data.items.map((certificate) => (
              <li key={certificate.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{certificate.code}</span>
                    {certificate.revokedAt ? <Badge tone="red">Bekor qilingan</Badge> : <Badge tone="green">Haqiqiy</Badge>}
                    {certificate.grade && <Badge tone="blue">Baho: {certificate.grade}</Badge>}
                  </div>
                  <p className="mt-1 truncate text-sm text-fg-muted">{certificate.courseName}</p>
                  <p className="text-xs text-fg-subtle">
                    Tugatgan: {formatDate(certificate.completionDate)} · Berilgan: {formatDate(certificate.issuedAt)}
                  </p>
                  <a
                    href={verifyUrl(certificate.verifyToken)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Tekshirish sahifasi
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                  <Link
                    to={`/certificates/${certificate.id}/print`}
                    className="mt-1 ml-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Chop etish / PDF
                    <Printer className="size-3" aria-hidden />
                  </Link>
                </div>
                <QrCode value={verifyUrl(certificate.verifyToken)} size={72} className="shrink-0 rounded" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {confirmIssue && (
        <ConfirmDialog
          open
          title="Sertifikat berilsinmi?"
          description="Hujjatdagi ism, kurs va natija hozirgi holatda muzlatiladi. Natija ko‘rsatilmasa, imtihonlardan o‘rtacha olinadi."
          confirmLabel="Berish"
          loading={issue.isPending}
          onConfirm={() => issue.mutate()}
          onCancel={() => setConfirmIssue(false)}
        />
      )}
    </Card>
  );
}
