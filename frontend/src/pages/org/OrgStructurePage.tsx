import { useQuery } from '@tanstack/react-query';
import { Briefcase, Crown, GraduationCap, Hourglass, Plane, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import type { OrgMember } from '@/types/org';
import { formatDate } from '@/utils/format';

/**
 * Tashkiliy tuzilma (ORG §2, §16): markaz rahbari, bo'limlar, xodimlar va o'qituvchilar, vakant lavozimlar.
 * "Kimga hisobot beradi" ko'rsatilmagan xodim markaz rahbariga bo'ysunadi.
 */
export default function OrgStructurePage() {
  const query = useQuery({ queryKey: queryKeys.org.structure, queryFn: orgService.structure });
  const data = query.data;
  const loading = query.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title="Tashkiliy tuzilma" description="One Center — One System — One Responsible Leader" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard size="sm" title="Jamoa" value={data?.summary.members ?? 0} icon={Users} loading={loading} />
        <StatCard size="sm" title="Xodimlar" value={data?.summary.employees ?? 0} icon={Briefcase} tone="primary" loading={loading} />
        <StatCard size="sm" title="O‘qituvchilar" value={data?.summary.teachers ?? 0} icon={GraduationCap} tone="info" loading={loading} />
        <StatCard size="sm" title="Sinov muddatida" value={data?.summary.onProbation ?? 0} icon={Hourglass} tone="warning" loading={loading} />
        <StatCard size="sm" title="Bugun ta’tilda" value={data?.summary.onLeave ?? 0} icon={Plane} loading={loading} />
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                <Crown className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-caption text-fg-subtle">Markaz rahbari (CEO) — strategik va yakuniy qarorlar</p>
                <p className="font-medium text-fg">
                  {data.leaders.length > 0 ? data.leaders.map((leader) => `${leader.firstName} ${leader.lastName}`.trim()).join(', ') : 'Belgilanmagan'}
                </p>
              </div>
              {data.summary.withoutAccount > 0 && (
                <Badge tone="yellow" className="ml-auto">
                  CRM hisobi yo‘q: {data.summary.withoutAccount}
                </Badge>
              )}
            </CardContent>
          </Card>

          {data.departments.length === 0 ? (
            <EmptyState icon={Users} title="Hali xodim yo‘q" description="Xodimlar va o‘qituvchilar qo‘shilganda bo‘limlar shu yerda ko‘rinadi" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.departments.map((department) => (
                <Card key={department.name}>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{department.name}</CardTitle>
                    <Badge tone="gray">{department.members.length}</Badge>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-border">
                      {department.members.map((member) => (
                        <MemberRow key={`${member.kind}:${member.id}`} member={member} />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {data.vacancies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Kelajakdagi lavozimlar</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-body text-fg-muted">Ishga olinmaguncha ularning vazifalari CEO va amaldagi mas’ullar o‘rtasida taqsimlanadi.</p>
                <ul className="flex flex-wrap gap-2">
                  {data.vacancies.map((vacancy) => (
                    <li key={vacancy.position}>
                      <Badge tone="gray">
                        <UserPlus className="mr-1 inline size-3.5" aria-hidden />
                        {vacancy.label} — vakant
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

function MemberRow({ member }: { member: OrgMember }) {
  const link = member.kind === 'teacher' ? `/teachers/${member.id}` : '/employees';
  return (
    <li className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link to={link} className="font-medium text-fg hover:underline">
          {member.name}
        </Link>
        <p className="text-caption text-fg-muted">
          {member.position}
          {member.manager ? ` · hisobot: ${member.manager.firstName} ${member.manager.lastName}`.trimEnd() : ''}
          {member.hireDate ? ` · ${formatDate(member.hireDate)} dan` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {member.probationDaysLeft !== null && (
          <Badge tone="blue">{member.probationDaysLeft === 0 ? 'Sinov bugun tugaydi' : `Sinovda · ${member.probationDaysLeft} kun`}</Badge>
        )}
        {member.onLeaveToday && <Badge tone="yellow">Ta’tilda</Badge>}
        {member.userId === null && <Badge tone="gray">CRM hisobi yo‘q</Badge>}
      </div>
    </li>
  );
}
