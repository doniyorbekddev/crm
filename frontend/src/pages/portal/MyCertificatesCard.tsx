import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';
import { QrCode } from '@/components/QrCode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { queryKeys } from '@/lib/queryKeys';
import { portalService } from '@/services/portal.service';
import { formatDate } from '@/utils/format';

/**
 * O'quvchining sertifikatlari. QR kod ochiq tekshiruv sahifasiga olib boradi —
 * uni ish beruvchiga ko'rsatish mumkin.
 */
export function MyCertificatesCard({ studentId }: { studentId?: string }) {
  const query = useQuery({
    queryKey: queryKeys.portal.certificates(studentId ?? ''),
    queryFn: () => portalService.certificates(studentId),
    enabled: Boolean(studentId),
  });

  if (!query.isPending && !query.isError && (query.data ?? []).length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="size-4 text-fg-subtle" aria-hidden />
          Sertifikatlar
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="space-y-3">
            {(query.data ?? []).map((certificate) => (
              <li key={certificate.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <QrCode value={`${window.location.origin}/verify/${certificate.verifyToken}`} size={72} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{certificate.courseName}</p>
                  <p className="font-mono text-xs text-fg-subtle">{certificate.code}</p>
                  <p className="text-xs text-fg-muted">
                    Berilgan: {formatDate(certificate.issuedAt)}
                    {certificate.grade ? ` · baho: ${certificate.grade}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
