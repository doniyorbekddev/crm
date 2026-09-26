import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, ImageIcon, Link2, Megaphone, Paperclip, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { TBody, TD, TH, THead, TR, Table, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { broadcastsService } from '@/services/broadcasts.service';
import { coursesService } from '@/services/courses.service';
import { groupsService } from '@/services/groups.service';
import type { BroadcastAudience, BroadcastButton, BroadcastItem, BroadcastMedia, BroadcastPayload, BroadcastPreview } from '@/types/broadcast';
import { formatDateTime, formatNumber } from '@/utils/format';

const AUDIENCES: ReadonlyArray<{ value: BroadcastAudience; label: string }> = [
  { value: 'STUDENTS', label: 'Barcha o‘quvchilar' },
  { value: 'PARENTS', label: 'Barcha ota-onalar' },
  { value: 'TEACHERS', label: 'O‘qituvchilar' },
  { value: 'STAFF', label: 'Barcha xodimlar' },
  { value: 'GROUP', label: 'Guruh' },
  { value: 'COURSE', label: 'Kurs' },
];

export const MAX_BUTTONS = 3;
const MAX_MESSAGE = 2000;

/** Server bilan bir xil qoida: faqat https, host nuqtali, login/parolsiz */
export function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

interface Draft {
  audience: BroadcastAudience;
  targetId: string;
  includeParents: boolean;
  message: string;
  buttons: BroadcastButton[];
}

const EMPTY: Draft = { audience: 'STUDENTS', targetId: '', includeParents: false, message: '', buttons: [] };

/** Brauzerda tezkor tekshiruv — yakuniy tekshiruv serverda */
export function validateBroadcast(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if ((draft.audience === 'GROUP' || draft.audience === 'COURSE') && !draft.targetId) errors.targetId = 'Guruh yoki kursni tanlang';
  const length = draft.message.trim().length;
  if (length < 2) errors.message = 'Xabar kamida 2 belgi';
  if (length > MAX_MESSAGE) errors.message = `Xabar ${MAX_MESSAGE} belgidan oshmasin`;
  draft.buttons.forEach((button, index) => {
    if (!button.text.trim()) errors[`buttons.${index}.text`] = 'Tugma matnini kiriting';
    else if (button.text.trim().length > 40) errors[`buttons.${index}.text`] = '40 belgidan oshmasin';
    if (!isSafeUrl(button.url)) errors[`buttons.${index}.url`] = 'https:// bilan boshlanadigan manzil';
  });
  return errors;
}

function toPayload(draft: Draft, media: BroadcastMedia | null): BroadcastPayload {
  const targeted = draft.audience === 'GROUP' || draft.audience === 'COURSE';
  return {
    audience: draft.audience,
    ...(targeted ? { targetId: draft.targetId } : {}),
    includeParents: targeted && draft.includeParents,
    message: draft.message.trim(),
    buttons: draft.buttons.map((button) => ({ text: button.text.trim(), url: button.url.trim() })),
    ...(media ? { mediaToken: media.token } : {}),
  };
}

function TargetSelect({ draft, onChange, error }: { draft: Draft; onChange: (targetId: string) => void; error: string | undefined }) {
  const isGroup = draft.audience === 'GROUP';
  const groups = useQuery({
    queryKey: [...queryKeys.broadcasts.targets, 'groups'],
    queryFn: () => groupsService.list({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'name', sortOrder: 'asc' }),
    enabled: isGroup,
  });
  const courses = useQuery({
    queryKey: [...queryKeys.broadcasts.targets, 'courses'],
    queryFn: () => coursesService.list({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'name', sortOrder: 'asc' }),
    enabled: !isGroup,
  });
  const options = isGroup ? (groups.data?.items ?? []) : (courses.data?.items ?? []);
  return (
    <FormField label={isGroup ? 'Guruh' : 'Kurs'} htmlFor="broadcast-target" error={error} required>
      <Select id="broadcast-target" value={draft.targetId} invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)}>
        <option value="">— tanlang —</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </Select>
    </FormField>
  );
}

/** Telegramdagi ko'rinishga yaqin: sarlavha, matn, fayl, havola tugmalari */
function TelegramPreview({ draft, media, imageUrl, preview }: { draft: Draft; media: BroadcastMedia | null; imageUrl: string | null; preview: BroadcastPreview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Oldindan ko‘rish</CardTitle>
        <CardDescription>
          Kimga: <strong>{preview.label}</strong> — <strong>{formatNumber(preview.recipients)}</strong> ta Telegram chat
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-sm rounded-2xl border border-border bg-surface-muted p-3 shadow-sm" aria-label="Xabar ko‘rinishi">
          {media && (media.kind === 'photo' && imageUrl ? (
            <img src={imageUrl} alt="Biriktirilgan rasm" className="mb-2 max-h-56 w-full rounded-xl object-cover" />
          ) : (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
              <FileText className="size-4" aria-hidden /> {media.fileName}
            </div>
          ))}
          <p className="text-sm font-semibold">📢 Xabar</p>
          <p className="whitespace-pre-wrap break-words text-sm">{draft.message.trim()}</p>
          {draft.buttons.length > 0 && (
            <div className="mt-2 grid gap-1">
              {draft.buttons.map((button, index) => (
                <a key={index} href={button.url} target="_blank" rel="noreferrer noopener" className="flex items-center justify-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-sm text-brand-700 dark:text-brand-300">
                  <Link2 className="size-3.5" aria-hidden /> {button.text}
                </a>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function History() {
  const history = useQuery({
    queryKey: queryKeys.broadcasts.list,
    queryFn: () => broadcastsService.list(),
    // Navbatda kutayotgan bo'lsa — statistika o'zi yangilanib tursin
    refetchInterval: (query) => ((query.state.data ?? []).some((item: BroadcastItem) => item.pending > 0) ? 10_000 : false),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tarix va statistika</CardTitle>
        <CardDescription>
          Mo‘ljal — auditoriyadagi Telegram chatlar; yetkazildi — Telegram qabul qilgani (Telegram o‘qilganini bildirmaydi); yetmadi — bloklagan yoki bog‘lanishi uzilgan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.isLoading ? (
          <TableSkeleton rows={4} columns={7} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState icon={Megaphone} title="Hali xabar yuborilmagan" description="Yuborilgan xabarlar va ularning yetkazilishi shu yerda ko‘rinadi." />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Sana</TH>
                  <TH>Kimga</TH>
                  <TH>Xabar</TH>
                  <TH className="text-right">Mo‘ljal</TH>
                  <TH className="text-right">Yuborildi</TH>
                  <TH className="text-right">Yetkazildi</TH>
                  <TH className="text-right">Yetmadi</TH>
                  <TH className="text-right">Navbatda</TH>
                </TR>
              </THead>
              <TBody>
                {(history.data ?? []).map((item) => (
                  <TR key={item.id}>
                    <TD className="whitespace-nowrap">
                      {formatDateTime(item.createdAt)}
                      {item.createdBy && <div className="text-xs text-fg-subtle">{item.createdBy}</div>}
                    </TD>
                    <TD>{item.label}</TD>
                    <TD className="max-w-xs">
                      <span className="line-clamp-2">{item.message}</span>
                      <span className="mt-1 flex gap-1">
                        {item.mediaKind && <Badge tone="blue">{item.mediaKind === 'photo' ? 'Rasm' : 'Hujjat'}</Badge>}
                        {item.buttons.length > 0 && <Badge tone="purple">{item.buttons.length} tugma</Badge>}
                      </span>
                    </TD>
                    <TD className="text-right">{formatNumber(item.recipients)}</TD>
                    <TD className="text-right">{formatNumber(item.sent)}</TD>
                    <TD className="text-right">{formatNumber(item.delivered)}</TD>
                    <TD className="text-right">{item.failed > 0 ? <Badge tone="red">{formatNumber(item.failed)}</Badge> : 0}</TD>
                    <TD className="text-right">{item.pending > 0 ? <Badge tone="yellow">{formatNumber(item.pending)}</Badge> : 0}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function BroadcastsPage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<BroadcastMedia | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; data: BroadcastPreview } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const payload = useMemo(() => toPayload(draft, media), [draft, media]);
  const payloadKey = JSON.stringify(payload);
  // Forma o'zgarsa — oldingi ko'rinish eskiradi, qayta ko'rish kerak
  const currentPreview = preview?.key === payloadKey ? preview.data : null;

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const serverErrors = (error: unknown) => {
    const fields = Object.fromEntries(getFieldErrors(error).map((item) => [item.field, item.message]));
    setErrors(fields);
    toast.error(getErrorMessage(error));
  };

  const upload = useMutation({
    mutationFn: (file: File) => broadcastsService.uploadMedia(file),
    onSuccess: (result, file) => {
      setMedia(result);
      setImageUrl(result.kind === 'photo' ? URL.createObjectURL(file) : null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const previewMutation = useMutation({
    mutationFn: () => broadcastsService.preview(payload),
    onSuccess: (data) => setPreview({ key: payloadKey, data }),
    onError: serverErrors,
  });
  const send = useMutation({
    mutationFn: () => broadcastsService.send(payload),
    onSuccess: (result) => {
      toast.success(result.message);
      setConfirming(false);
      setDraft(EMPTY);
      setMedia(null);
      setImageUrl(null);
      setPreview(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.broadcasts.all });
    },
    onError: (error) => {
      setConfirming(false);
      serverErrors(error);
    },
  });

  const runPreview = () => {
    const found = validateBroadcast(draft);
    setErrors(found);
    if (Object.keys(found).length === 0) previewMutation.mutate();
  };

  const targeted = draft.audience === 'GROUP' || draft.audience === 'COURSE';

  return (
    <div className="space-y-6">
      <PageHeader title="Ommaviy xabar" description="Telegram orqali o‘quvchi, ota-ona va xodimlarga — matn, rasm yoki hujjat, havola tugmalari bilan." />
      <Alert tone="info">
        Xabar navbat orqali partiyalab yuboriladi (Telegram cheklovlari va qayta urinish bilan). Leadlarga yuborib bo‘lmaydi — ularda Telegram bog‘lanishi yo‘q.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Yangi xabar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Kimga" htmlFor="broadcast-audience" required>
              <Select id="broadcast-audience" value={draft.audience} onChange={(event) => update({ audience: event.target.value as BroadcastAudience, targetId: '' })}>
                {AUDIENCES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {targeted && (
              <>
                <TargetSelect draft={draft} error={errors.targetId} onChange={(targetId) => update({ targetId })} />
                <Checkbox label="Ota-onalarga ham yuborilsin" checked={draft.includeParents} onChange={(event) => update({ includeParents: event.target.checked })} />
              </>
            )}
            <FormField label="Xabar" htmlFor="broadcast-message" error={errors.message} hint={`${draft.message.trim().length}/${MAX_MESSAGE}`} required>
              <Textarea id="broadcast-message" rows={6} maxLength={MAX_MESSAGE} value={draft.message} invalid={Boolean(errors.message)} onChange={(event) => update({ message: event.target.value })} />
            </FormField>

            <div className="space-y-2">
              <p className="text-sm font-medium">Rasm yoki hujjat (ixtiyoriy)</p>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="sr-only"
                aria-label="Rasm yoki hujjat fayli"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) upload.mutate(file);
                }}
              />
              {media ? (
                <div className="flex items-center gap-2 text-sm">
                  {media.kind === 'photo' ? <ImageIcon className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
                  <span className="truncate">{media.fileName}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<X className="size-4" />}
                    onClick={() => {
                      setMedia(null);
                      setImageUrl(null);
                    }}
                  >
                    Olib tashlash
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" loading={upload.isPending} leftIcon={<Paperclip className="size-4" />} onClick={() => fileInput.current?.click()}>
                  Fayl biriktirish
                </Button>
              )}
              <p className="text-xs text-fg-subtle">PNG, JPG, WEBP yoki PDF.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Havola tugmalari (ixtiyoriy, {MAX_BUTTONS} tagacha)</p>
              {draft.buttons.map((button, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <FormField label={`Tugma ${index + 1} matni`} htmlFor={`button-text-${index}`} error={errors[`buttons.${index}.text`]}>
                    <Input
                      id={`button-text-${index}`}
                      value={button.text}
                      maxLength={40}
                      onChange={(event) => update({ buttons: draft.buttons.map((row, position) => (position === index ? { ...row, text: event.target.value } : row)) })}
                    />
                  </FormField>
                  <FormField label="Havola" htmlFor={`button-url-${index}`} error={errors[`buttons.${index}.url`]}>
                    <Input
                      id={`button-url-${index}`}
                      value={button.url}
                      placeholder="https://"
                      inputMode="url"
                      onChange={(event) => update({ buttons: draft.buttons.map((row, position) => (position === index ? { ...row, url: event.target.value } : row)) })}
                    />
                  </FormField>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    aria-label={`Tugma ${index + 1} ni olib tashlash`}
                    onClick={() => update({ buttons: draft.buttons.filter((_, position) => position !== index) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              {draft.buttons.length < MAX_BUTTONS && (
                <Button variant="secondary" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => update({ buttons: [...draft.buttons, { text: '', url: '' }] })}>
                  Tugma qo‘shish
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="secondary" leftIcon={<Eye className="size-4" />} loading={previewMutation.isPending} onClick={runPreview}>
                Oldindan ko‘rish
              </Button>
              <Button leftIcon={<Send className="size-4" />} disabled={!currentPreview || currentPreview.recipients === 0} onClick={() => setConfirming(true)}>
                Yuborish{currentPreview ? ` (${formatNumber(currentPreview.recipients)})` : ''}
              </Button>
            </div>
            {!currentPreview && <p className="text-xs text-fg-subtle">Yuborishdan oldin oldindan ko‘ring — nechta chatga ketishi aniqlanadi.</p>}
            {currentPreview?.recipients === 0 && <Alert tone="warning">Bu auditoriyada Telegram ulagan hech kim yo‘q.</Alert>}
          </CardContent>
        </Card>

        {currentPreview ? (
          <TelegramPreview draft={draft} media={media} imageUrl={imageUrl} preview={currentPreview} />
        ) : (
          <Card>
            <CardContent className="py-10">
              <EmptyState icon={Eye} title="Ko‘rinish shu yerda" description="Xabarni yozib, “Oldindan ko‘rish” ni bosing." />
            </CardContent>
          </Card>
        )}
      </div>

      <History />

      <ConfirmDialog
        open={confirming}
        tone="primary"
        title="Xabar yuborilsinmi?"
        description={currentPreview ? `${currentPreview.label} — ${formatNumber(currentPreview.recipients)} ta chatga yuboriladi. Qaytarib bo‘lmaydi.` : ''}
        confirmLabel="Yuborish"
        cancelLabel="Bekor qilish"
        loading={send.isPending}
        onConfirm={() => send.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
