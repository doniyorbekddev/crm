import { DataTable } from '@/components/ui/DataTable';
import { Tooltip } from '@/components/ui/Tooltip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Lock, LockKeyhole, LockOpen } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { TableSkeleton } from '@/components/ui/Table';
import { Textarea } from '@/components/ui/Textarea';
import { usePermission } from '@/hooks/usePermission';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { financeService } from '@/services/finance.service';
import type { FinancialPeriod } from '@/types/finance';
import { formatDateTime, formatMoney } from '@/utils/format';
import { PERMISSIONS } from '@/utils/permissionKeys';

const thisYear = new Date().getFullYear();

type ReasonAction = 'reopen' | 'lock' | 'unlock';

const REASON_ACTIONS: Record<ReasonAction, { title: string; confirm: string; warning: string }> = {
  reopen: {
    title: 'Oyni qayta ochish',
    confirm: 'Qayta ochish',
    warning: 'Qayta ochilgan oyga yana yozuv qo‘shish va bekor qilish mumkin bo‘ladi. Amal audit jurnaliga yoziladi.',
  },
  lock: {
    title: 'Oyni qulflash',
    confirm: 'Qulflash',
    warning: 'Qulflangan oyni qayta ochib, davomatini tuzatib yoki oy oxiri snapshotini to‘ldirib bo‘lmaydi — avval qulfni ochish kerak. Amal audit jurnaliga yoziladi.',
  },
  unlock: {
    title: 'Oy qulfini ochish',
    confirm: 'Qulfni ochish',
    warning: 'Oy yana “yopilgan” holatiga qaytadi: ruxsat bilan qayta ochish va davomatni tuzatish mumkin bo‘ladi. Amal audit jurnaliga yoziladi.',
  },
};

const STATUS_BADGE = {
  OPEN: { tone: 'green', label: 'Ochiq' },
  CLOSED: { tone: 'gray', label: 'Yopilgan' },
  LOCKED: { tone: 'red', label: 'Qulflangan' },
} as const;
const YEAR_OPTIONS = Array.from({ length: 4 }, (_, index) => thisYear - index);

/** Moliyaviy oylar: yopilgan oyga pul yozuvi qo‘shilmaydi va bekor qilinmaydi */
export function FinancialPeriodsTab() {
  const queryClient = useQueryClient();
  const canClose = usePermission(PERMISSIONS.FINANCE_CLOSE);
  const canReopen = usePermission(PERMISSIONS.FINANCE_REOPEN);
  const canLock = usePermission(PERMISSIONS.FINANCE_LOCK);
  const [year, setYear] = useState(thisYear);
  const [closing, setClosing] = useState<FinancialPeriod | null>(null);
  const [pending, setPending] = useState<{ action: ReasonAction; period: FinancialPeriod } | null>(null);
  const [snapshotOf, setSnapshotOf] = useState<FinancialPeriod | null>(null);
  const [reason, setReason] = useState('');

  const query = useQuery({ queryKey: queryKeys.finance.periods(year), queryFn: () => financeService.periods(year) });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });

  const close = useMutation({
    mutationFn: (period: FinancialPeriod) => financeService.closePeriod({ year: period.year, month: period.month }),
    onSuccess: (result) => {
      toast.success(result.message);
      setClosing(null);
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const withReason = useMutation({
    mutationFn: ({ action, period }: { action: ReasonAction; period: FinancialPeriod }) => {
      const payload = { year: period.year, month: period.month, reason: reason.trim() };
      if (action === 'lock') return financeService.lockPeriod(payload);
      if (action === 'unlock') return financeService.unlockPeriod(payload);
      return financeService.reopenPeriod(payload);
    },
    onSuccess: (result) => {
      toast.success(result.message);
      setPending(null);
      setReason('');
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <Alert tone="info">
        Yopilgan oy sanasi bilan to‘lov, tushum, xarajat, o‘tkazma va maosh to‘lovi qo‘shilmaydi, bekor ham qilinmaydi. Xato bo‘lsa, tuzatish
        ochiq oyda kiritiladi (pulni qaytarish, yangi xarajat).
      </Alert>

      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <p className="text-label text-fg">Moliyaviy oylar</p>
          <Select value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Yil" wrapperClassName="w-28">
            {YEAR_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        {query.isPending ? (
          <TableSkeleton rows={6} columns={6} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            bare
            label="Moliyaviy oylar"
            rows={query.data}
            rowKey={(period) => String(period.month)}
            rowClassName={(period) => cn(period.isCurrent && 'bg-primary-subtle')}
            mobileLayout="cards"
            columns={[
              {
                key: 'c0',
                label: 'Oy',
                tdClassName: 'font-medium whitespace-nowrap text-fg',
                cell: (period) => (
                  <>
                    {period.label}
                    {period.isCurrent && <span className="ml-2 text-caption text-fg-muted">joriy</span>}
                  </>
                ),
              },
              {
                key: 'c1',
                label: 'Holat',
                cell: (period) => (
                  <>
                    <Badge tone={STATUS_BADGE[period.status].tone}>{STATUS_BADGE[period.status].label}</Badge>
                    {period.status === 'OPEN' && period.reopenedAt && (
                      <Tooltip content={period.reopenReason ?? ''} describe={false} disabled={!period.reopenReason} wrapperClassName="mt-1 block">
                        <span className="block text-caption text-warning">
                          qayta ochilgan
                          {period.reopenReason && <span className="sr-only">: {period.reopenReason}</span>}
                        </span>
                      </Tooltip>
                    )}
                  </>
                ),
              },
              {
                key: 'c2',
                label: 'Tushum',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg',
                cell: (period) => <>{formatMoney(period.totals.income)}</>,
              },
              {
                key: 'c3',
                label: 'Xarajat',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg',
                cell: (period) => <>{formatMoney(period.totals.expense)}</>,
              },
              {
                key: 'c4',
                label: 'Qaytarishlar',
                thClassName: 'text-right',
                tdClassName: 'text-right whitespace-nowrap tabular-nums text-fg-muted',
                cell: (period) => <>{formatMoney(period.totals.refunds)}</>,
              },
              {
                key: 'c5',
                label: 'Sof natija',
                thClassName: 'text-right',
                tdClassName: (period) => cn( 'text-right font-medium whitespace-nowrap tabular-nums', period.totals.net < 0 ? 'text-danger' : 'text-success', ),
                cell: (period) => (
                  <>
                    {formatMoney(period.totals.net)}
                  </>
                ),
              },
              {
                key: 'c6',
                label: 'Yopilgan',
                tdClassName: 'text-caption whitespace-nowrap text-fg-muted',
                cell: (period) => (
                  <>
                    {period.closedAt && period.status !== 'OPEN'
                      ? `${formatDateTime(period.closedAt)} · ${period.closedBy ? `${period.closedBy.firstName} ${period.closedBy.lastName}` : '—'}`
                      : '—'}
                    {period.status === 'LOCKED' && period.lockedAt && (
                      <span className="block">
                        Qulflangan: {formatDateTime(period.lockedAt)}
                        {period.lockedBy ? ` · ${period.lockedBy.firstName} ${period.lockedBy.lastName}` : ''}
                      </span>
                    )}
                  </>
                ),
              },
              {
                key: 'c7',
                label: 'Amallar',
                header: <span className="sr-only">Amallar</span>,
                fixed: true,
                thClassName: 'w-32',
                tdClassName: 'text-right',
                cell: (period) => (
                  <div className="flex flex-wrap justify-end gap-1">
                    {period.canClose && canClose && (
                      <Button size="sm" variant="secondary" leftIcon={<Lock className="size-4" aria-hidden />} onClick={() => setClosing(period)}>
                        Yopish
                      </Button>
                    )}
                    {period.status === 'CLOSED' && canReopen && (
                      <Button size="sm" variant="ghost" leftIcon={<LockOpen className="size-4" aria-hidden />} onClick={() => setPending({ action: 'reopen', period })}>
                        Ochish
                      </Button>
                    )}
                    {period.status === 'CLOSED' && canLock && (
                      <Button size="sm" variant="ghost" leftIcon={<LockKeyhole className="size-4" aria-hidden />} onClick={() => setPending({ action: 'lock', period })}>
                        Qulflash
                      </Button>
                    )}
                    {period.status === 'LOCKED' && canLock && (
                      <Button size="sm" variant="ghost" leftIcon={<LockOpen className="size-4" aria-hidden />} onClick={() => setPending({ action: 'unlock', period })}>
                        Qulfni ochish
                      </Button>
                    )}
                    {!period.isCurrent && (period.canClose || period.status !== 'OPEN') && (
                      <Button size="sm" variant="ghost" leftIcon={<Camera className="size-4" aria-hidden />} onClick={() => setSnapshotOf(period)}>
                        Oy oxiri
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <ConfirmDialog
        open={closing !== null}
        title="Moliyaviy oyni yopish"
        tone="primary"
        description={
          closing ? (
            <>
              {closing.label} yopiladi: tushum {formatMoney(closing.totals.income)}, xarajat {formatMoney(closing.totals.expense)}, sof natija{' '}
              <strong>{formatMoney(closing.totals.net)}</strong>. Shundan keyin bu oy sanasi bilan pul yozuvlari o‘zgartirilmaydi.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Oyni yopish"
        loading={close.isPending}
        onConfirm={() => closing && close.mutate(closing)}
        onCancel={() => setClosing(null)}
      />

      {pending && (
        <Modal
          open
          title={REASON_ACTIONS[pending.action].title}
          description={pending.period.label}
          onClose={() => setPending(null)}
          closeDisabled={withReason.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPending(null)} disabled={withReason.isPending}>
                Bekor qilish
              </Button>
              <Button variant="danger" loading={withReason.isPending} disabled={reason.trim().length < 5} onClick={() => withReason.mutate(pending)}>
                {REASON_ACTIONS[pending.action].confirm}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Alert tone="warning">{REASON_ACTIONS[pending.action].warning}</Alert>
            <FormField label="Sabab" htmlFor="period-reason" required>
              <Textarea id="period-reason" rows={3} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} />
            </FormField>
          </div>
        </Modal>
      )}

      {snapshotOf && <SnapshotModal period={snapshotOf} canGenerate={canLock} onClose={() => setSnapshotOf(null)} />}
    </div>
  );
}

/** Oy oxiri snapshoti: o'tgan oy hisobotlari keyingi to'lov va o'zgarishlardan ta'sirlanmasligi uchun qotirilgan holat */
function SnapshotModal({ period, canGenerate, onClose }: { period: FinancialPeriod; canGenerate: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const queryKey = [...queryKeys.finance.all, 'snapshot', period.year, period.month];
  const query = useQuery({ queryKey, queryFn: () => financeService.periodSnapshot(period.year, period.month) });
  const generate = useMutation({
    mutationFn: () => financeService.generatePeriodSnapshot({ year: period.year, month: period.month }),
    onSuccess: (result) => {
      toast.success(`${result.message}: ${result.data.created} ta yangi yozuv`);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });
  const data = query.data;

  return (
    <Modal
      open
      title="Oy oxiri holati"
      description={period.label}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Yopish
          </Button>
          {canGenerate && period.status !== 'LOCKED' && (
            <Button loading={generate.isPending} onClick={() => generate.mutate()}>
              Yetishmayotganini to‘ldirish
            </Button>
          )}
        </>
      }
    >
      {query.isPending ? (
        <TableSkeleton rows={3} columns={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data && data.students > 0 ? (
        <div className="space-y-3">
          {data.estimated && <Alert tone="warning">Taxminiy: snapshot oy tugaganidan keyin tarixdan tiklangan (shartnoma narxining qo‘lda tahrirlari tarixda yo‘q).</Alert>}
          <dl className="grid grid-cols-2 gap-3 text-body">
            <dt className="text-fg-muted">O‘quvchilar</dt>
            <dd className="text-right tabular-nums text-fg">{data.students}</dd>
            <dt className="text-fg-muted">Faol</dt>
            <dd className="text-right tabular-nums text-fg">{data.active}</dd>
            <dt className="text-fg-muted">Qarzdorlar</dt>
            <dd className="text-right tabular-nums text-fg">{data.debtors}</dd>
            <dt className="text-fg-muted">Oy oxiridagi qarz</dt>
            <dd className="text-right tabular-nums text-fg">{formatMoney(data.totalDebt)}</dd>
            <dt className="text-fg-muted">Olingan</dt>
            <dd className="text-right text-fg">{data.generatedAt ? formatDateTime(data.generatedAt) : '—'}</dd>
          </dl>
        </div>
      ) : (
        <Alert tone="info">Bu oy uchun snapshot hali olinmagan — hisobotlar qarzni tarixdan taxminiy tiklaydi.</Alert>
      )}
    </Modal>
  );
}
