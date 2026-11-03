import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, History, PlayCircle, Plus } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { orgService } from '@/services/org.service';
import type { EmployeePosition } from '@/types/employee';
import type { KnowledgeCategory, KnowledgeDetail, KnowledgeItem, KnowledgePayload, KnowledgeStatus } from '@/types/org';
import { EMPLOYEE_POSITION_LABELS, EMPLOYEE_POSITION_ORDER } from '@/utils/employeeLabels';
import { formatDate, formatDateTime } from '@/utils/format';
import { KNOWLEDGE_CATEGORY_LABELS, KNOWLEDGE_STATUS_LABELS, KNOWLEDGE_STATUS_TONES, personName } from '@/utils/orgLabels';

const CATEGORIES = Object.keys(KNOWLEDGE_CATEGORY_LABELS) as KnowledgeCategory[];

/**
 * Bilimlar bazasi (ORG §14): lavozim yo‘riqnomalari, ichki qoidalar, video qo‘llanmalar, savdo skriptlari,
 * dars standartlari va o‘quv materiallari. Xodim o‘z roliga ochilgan hujjatlarni ko‘radi; har tahrir — yangi versiya.
 */
export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const [category, setCategory] = useState<KnowledgeCategory | ''>('');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<KnowledgeDetail | 'new' | null>(null);
  const filters = { category, pendingOnly, search };
  const query = useQuery({
    queryKey: queryKeys.org.knowledge(filters),
    queryFn: () => orgService.knowledge({ ...(category ? { category } : {}), ...(pendingOnly ? { pendingAck: 'true' } : {}), ...(search ? { search } : {}) }),
  });
  const open = (id: string | null) => setParams(id ? { id } : {}, { replace: true });
  const groups = new Map<KnowledgeCategory, KnowledgeItem[]>();
  for (const item of query.data?.items ?? []) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bilimlar bazasi"
        description="Yo‘riqnomalar, qoidalar, skriptlar va dars standartlari — bitta joyda"
        actions={
          query.data?.manage && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing('new')}>
              Hujjat yozish
            </Button>
          )
        }
      />
      {query.data && query.data.pendingAck > 0 && !pendingOnly && (
        <Alert tone="warning">
          {query.data.pendingAck} ta hujjat bilan tanishib chiqishingiz kerak.{' '}
          <button type="button" className="font-medium underline" onClick={() => setPendingOnly(true)}>
            Ko‘rsatish
          </button>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Turkum" value={category} onChange={(event) => setCategory(event.target.value as KnowledgeCategory | '')} wrapperClassName="w-56">
          <option value="">Barcha turkumlar</option>
          {CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {KNOWLEDGE_CATEGORY_LABELS[key]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-body text-fg">
          <Checkbox checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} />
          Faqat tanishishim kerak bo‘lganlar
        </label>
        <SearchInput label="Hujjat qidirish" placeholder="Sarlavha yoki matn" value={search} onChange={setSearch} className="w-full sm:ml-auto sm:w-64" />
      </div>
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : groups.size === 0 ? (
        <EmptyState icon={BookOpen} title="Hujjat yo‘q" description="Sizga ochilgan hujjatlar shu yerda ko‘rinadi" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...groups].map(([key, items]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{KNOWLEDGE_CATEGORY_LABELS[key]}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => open(item.id)} className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left hover:bg-surface-muted">
                        <span className="min-w-0">
                          <span className="block font-medium text-fg">{item.title}</span>
                          <span className="block text-caption text-fg-muted">
                            v{item.version} · {formatDate(item.updatedAt)}
                            {item.position ? ` · ${EMPLOYEE_POSITION_LABELS[item.position]}` : ''}
                            {item.audience.length > 0 ? ` · ${item.audience.map((role) => role.name).join(', ')}` : ''}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1">
                          {item.status !== 'PUBLISHED' && <Badge tone={KNOWLEDGE_STATUS_TONES[item.status]}>{KNOWLEDGE_STATUS_LABELS[item.status]}</Badge>}
                          {item.requiresAck && (item.acknowledged ? <Badge tone="green">Tanishgan</Badge> : <Badge tone="yellow">Tanishish kerak</Badge>)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ArticleDrawer id={openId} onClose={() => open(null)} onEdit={(article) => setEditing(article)} />
      {editing && <ArticleEditor article={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setEditing(null); open(id); }} />}
    </div>
  );
}

function ArticleDrawer({ id, onClose, onEdit }: { id: string | null; onClose: () => void; onEdit: (article: KnowledgeDetail) => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.org.article(id ?? ''), queryFn: () => orgService.article(id!), enabled: Boolean(id) });
  const [version, setVersion] = useState<number | null>(null);
  const old = useQuery({ queryKey: ['org', 'article-version', id, version], queryFn: () => orgService.articleVersion(id!, version!), enabled: Boolean(id) && version !== null });
  const article = query.data;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
  const acknowledge = useMutation({
    mutationFn: () => orgService.acknowledge(id!),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const setStatus = useMutation({
    mutationFn: (status: KnowledgeStatus) => orgService.articleStatus(id!, status),
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const showingOld = version !== null && article && version !== article.version;

  return (
    <Drawer open={Boolean(id)} title={article?.title ?? 'Hujjat'} onClose={() => { setVersion(null); onClose(); }} size="lg">
      {query.isPending ? (
        <Skeleton className="h-40" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : article ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="gray">{KNOWLEDGE_CATEGORY_LABELS[article.category]}</Badge>
            <Badge tone={KNOWLEDGE_STATUS_TONES[article.status]}>{KNOWLEDGE_STATUS_LABELS[article.status]}</Badge>
            <span className="text-caption text-fg-subtle">
              v{article.version} · {formatDateTime(article.updatedAt)} · {personName(article.updatedBy)}
            </span>
          </div>
          {showingOld && (
            <Alert tone="info">
              Eski versiya (v{version}) ko‘rsatilmoqda.{' '}
              <button type="button" className="font-medium underline" onClick={() => setVersion(null)}>
                Joriy versiyaga qaytish
              </button>
            </Alert>
          )}
          {(showingOld ? old.data?.videoUrl : article.videoUrl) && (
            <a href={(showingOld ? old.data?.videoUrl : article.videoUrl) ?? undefined} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 text-primary hover:underline">
              <PlayCircle className="size-4" aria-hidden />
              Videoni ochish
            </a>
          )}
          <div className="whitespace-pre-line rounded-md border border-border p-4 text-body text-fg">{showingOld ? (old.data?.body ?? '…') : article.body}</div>

          {article.requiresAck && article.status === 'PUBLISHED' && !showingOld && (
            article.acknowledged ? (
              <p className="flex items-center gap-2 text-body text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                Siz bu versiya bilan tanishgansiz
              </p>
            ) : (
              <Button loading={acknowledge.isPending} onClick={() => acknowledge.mutate()}>
                Tanishib chiqdim
              </Button>
            )
          )}

          {article.can.manage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => onEdit(article)}>
                Tahrirlash (yangi versiya)
              </Button>
              {article.status !== 'PUBLISHED' && (
                <Button size="sm" loading={setStatus.isPending} onClick={() => setStatus.mutate('PUBLISHED')}>
                  E’lon qilish
                </Button>
              )}
              {article.status === 'PUBLISHED' && (
                <Button size="sm" variant="ghost" loading={setStatus.isPending} onClick={() => setStatus.mutate('ARCHIVED')}>
                  Arxivlash
                </Button>
              )}
            </div>
          )}

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-label font-medium text-fg">
              <History className="size-4 text-fg-subtle" aria-hidden />
              Versiyalar tarixi
            </h3>
            <ul className="space-y-1 text-body">
              {article.versions.map((entry) => (
                <li key={entry.version}>
                  <button type="button" className="text-left hover:underline" onClick={() => setVersion(entry.version === article.version ? null : entry.version)}>
                    v{entry.version} · {formatDateTime(entry.createdAt)} · {personName(entry.editor)}
                    {entry.changeNote ? ` — ${entry.changeNote}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {article.acknowledgements && article.requiresAck && (
            <section>
              <h3 className="mb-2 text-label font-medium text-fg">Joriy versiya bilan tanishganlar ({article.acknowledgements.length})</h3>
              <ul className="space-y-1 text-caption text-fg-muted">
                {article.acknowledgements.map((ack) => (
                  <li key={ack.user.id}>
                    {personName(ack.user)} · {formatDateTime(ack.acknowledgedAt)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

function ArticleEditor({ article, onClose, onSaved }: { article: KnowledgeDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const queryClient = useQueryClient();
  const roles = useQuery({ queryKey: ['org', 'knowledge-roles'], queryFn: orgService.knowledgeRoles, staleTime: 300_000 });
  const [title, setTitle] = useState(article?.title ?? '');
  const [category, setCategory] = useState<KnowledgeCategory>(article?.category ?? 'POLICY');
  const [body, setBody] = useState(article?.body ?? '');
  const [videoUrl, setVideoUrl] = useState(article?.videoUrl ?? '');
  const [audience, setAudience] = useState<string[]>(article?.audience.map((role) => role.id) ?? []);
  const [position, setPosition] = useState<EmployeePosition | ''>(article?.position ?? '');
  const [requiresAck, setRequiresAck] = useState(article?.requiresAck ?? false);
  const [changeNote, setChangeNote] = useState('');
  const save = useMutation({
    mutationFn: () => {
      const payload: KnowledgePayload = {
        title: title.trim(),
        category,
        body: body.trim(),
        videoUrl: videoUrl.trim() || null,
        audienceRoleIds: audience,
        position: position || null,
        requiresAck,
        ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
      };
      return orgService.saveArticle(article?.id ?? null, payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.org.all });
      onSaved(result.data.id);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const valid = title.trim().length >= 3 && body.trim().length >= 10;

  return (
    <Modal
      open
      size="lg"
      title={article ? `Tahrirlash — v${article.version + 1}` : 'Yangi hujjat'}
      description={article ? 'Saqlanganda yangi versiya yaratiladi; eski matn tarixda qoladi.' : 'Qoralama sifatida saqlanadi — e’lon qilinmaguncha xodimlar ko‘rmaydi.'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" form="article-form" disabled={!valid} loading={save.isPending}>
            Saqlash
          </Button>
        </>
      }
    >
      <form id="article-form" className="space-y-4" onSubmit={onSubmit} noValidate>
        <FormField label="Sarlavha" htmlFor="article-title" required>
          <Input id="article-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Turkum" htmlFor="article-category">
            <Select id="article-category" value={category} onChange={(event) => setCategory(event.target.value as KnowledgeCategory)}>
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {KNOWLEDGE_CATEGORY_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Lavozim (yo‘riqnoma uchun)" htmlFor="article-position">
            <Select id="article-position" value={position} onChange={(event) => setPosition(event.target.value as EmployeePosition | '')}>
              <option value="">Tanlanmagan</option>
              {EMPLOYEE_POSITION_ORDER.map((key) => (
                <option key={key} value={key}>
                  {EMPLOYEE_POSITION_LABELS[key]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField label="Matn" htmlFor="article-body" required>
          <Textarea id="article-body" rows={10} maxLength={100_000} value={body} onChange={(event) => setBody(event.target.value)} />
        </FormField>
        <FormField label="Video havolasi" htmlFor="article-video" hint="https:// bilan (YouTube, Telegram, Drive)">
          <Input id="article-video" type="url" value={videoUrl} maxLength={500} onChange={(event) => setVideoUrl(event.target.value)} />
        </FormField>
        <FormField label="Kimlar ko‘radi" htmlFor="article-audience" hint="Tanlanmasa — barcha xodimlar">
          <MultiSelect id="article-audience" options={(roles.data ?? []).map((role) => ({ value: role.id, label: role.name }))} value={audience} onChange={setAudience} placeholder="Barcha xodimlar" />
        </FormField>
        <label className="flex items-center gap-2 text-body text-fg">
          <Checkbox checked={requiresAck} onChange={(event) => setRequiresAck(event.target.checked)} />
          Tanishish majburiy (xodim “Tanishib chiqdim” deb tasdiqlaydi)
        </label>
        {article && (
          <FormField label="Nima o‘zgardi" htmlFor="article-change">
            <Input id="article-change" value={changeNote} maxLength={255} onChange={(event) => setChangeNote(event.target.value)} />
          </FormField>
        )}
      </form>
    </Modal>
  );
}
