import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, SearchCheck, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/queryKeys';
import { curriculumService } from '@/services/curriculum.service';
import { examsService } from '@/services/homework.service';
import type { BlueprintDifficulty, ExamBlueprint } from '@/types/homework';
import { DIFFICULTY_LABELS } from '@/utils/questionLabels';

/** Formadagi holat — raqamlar matn ko'rinishida (input qiymati) */
export interface BlueprintDraft {
  enabled: boolean;
  total: string;
  topics: Array<{ topicId: string; percent: string }>;
  useDifficulty: boolean;
  difficulty: Record<BlueprintDifficulty, string>;
}

const LEVELS: BlueprintDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

export function blueprintDraftFrom(blueprint: ExamBlueprint | null | undefined): BlueprintDraft {
  return {
    enabled: Boolean(blueprint),
    total: String(blueprint?.total ?? 20),
    topics: (blueprint?.topics ?? []).map((topic) => ({ topicId: topic.topicId, percent: String(topic.percent) })),
    useDifficulty: Boolean(blueprint?.difficulty),
    difficulty: {
      EASY: String(blueprint?.difficulty?.EASY ?? 30),
      MEDIUM: String(blueprint?.difficulty?.MEDIUM ?? 50),
      HARD: String(blueprint?.difficulty?.HARD ?? 20),
    },
  };
}

/** Qoralama → API shakli; xato bo'lsa matn qaytaradi (server ham tekshiradi) */
export function blueprintFromDraft(draft: BlueprintDraft): { value: ExamBlueprint | null; error: string | null } {
  if (!draft.enabled) return { value: null, error: null };
  const total = Number(draft.total);
  if (!Number.isInteger(total) || total < 1 || total > 100) return { value: null, error: 'Savollar soni 1–100 oralig‘ida bo‘lsin' };
  const topics = draft.topics.filter((topic) => topic.topicId).map((topic) => ({ topicId: topic.topicId, percent: Number(topic.percent) || 0 }));
  if (topics.length > 0) {
    const sum = topics.reduce((acc, topic) => acc + topic.percent, 0);
    if (sum !== 100) return { value: null, error: `Mavzular ulushi 100% bo‘lishi kerak (hozir ${sum}%)` };
    if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length) return { value: null, error: 'Mavzu takrorlanmasin' };
  }
  let difficulty: ExamBlueprint['difficulty'];
  if (draft.useDifficulty) {
    difficulty = { EASY: Number(draft.difficulty.EASY) || 0, MEDIUM: Number(draft.difficulty.MEDIUM) || 0, HARD: Number(draft.difficulty.HARD) || 0 };
    const sum = difficulty.EASY + difficulty.MEDIUM + difficulty.HARD;
    if (sum !== 100) return { value: null, error: `Qiyinlik ulushi 100% bo‘lishi kerak (hozir ${sum}%)` };
  }
  return { value: { total, topics, ...(difficulty ? { difficulty } : {}) }, error: null };
}

interface BlueprintEditorProps {
  draft: BlueprintDraft;
  onChange: (draft: BlueprintDraft) => void;
  courseId: string | null;
  groupId: string | null;
  /** Urinishlar boshlangan — blueprint o'zgartirilmaydi */
  locked?: boolean;
}

/**
 * Blueprint (TZ §23–24): har o'quvchiga savollar bankidan **alohida variant** — mavzu va qiyinlik
 * ulushlari bo'yicha. "Tekshirish" bankda savol yetarliligini oldindan ko'rsatadi.
 */
export function BlueprintEditor({ draft, onChange, courseId, groupId, locked = false }: BlueprintEditorProps) {
  const curriculumQuery = useQuery({
    queryKey: queryKeys.curriculum.course(courseId ?? ''),
    queryFn: () => curriculumService.forCourse(courseId!),
    enabled: draft.enabled && Boolean(courseId),
  });
  const topicOptions = (curriculumQuery.data?.modules ?? []).flatMap((module) => module.topics.map((topic) => ({ id: topic.id, label: `${module.title} · ${topic.title}` })));
  const parsed = blueprintFromDraft(draft);
  const preview = useMutation({ mutationFn: () => examsService.previewBlueprint(groupId!, parsed.value!) });

  const patch = (next: Partial<BlueprintDraft>) => {
    preview.reset();
    onChange({ ...draft, ...next });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3" disabled={locked}>
      <legend className="px-1 text-sm font-medium text-fg">Variantlar (blueprint)</legend>
      <Checkbox
        label="Har o‘quvchiga savollar bankidan alohida tasodifiy variant"
        checked={draft.enabled}
        onChange={(event) => patch({ enabled: event.target.checked })}
      />
      {locked && <p className="text-xs text-fg-subtle">Urinishlar boshlangan — blueprintni o‘zgartirib bo‘lmaydi.</p>}

      {draft.enabled && (
        <>
          <FormField label="Savollar soni" htmlFor="blueprint-total">
            <Input id="blueprint-total" inputMode="numeric" value={draft.total} onChange={(event) => patch({ total: event.target.value })} />
          </FormField>

          <div>
            <p className="mb-1 text-sm font-medium text-fg">Mavzular ulushi</p>
            <p className="mb-2 text-xs text-fg-subtle">Bo‘sh — kursning barcha savollaridan. Ulushlar yig‘indisi 100%.</p>
            <ul className="space-y-2">
              {draft.topics.map((topic, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Select
                    aria-label={`${index + 1}-mavzu`}
                    value={topic.topicId}
                    onChange={(event) => patch({ topics: draft.topics.map((row, position) => (position === index ? { ...row, topicId: event.target.value } : row)) })}
                  >
                    <option value="">Mavzuni tanlang…</option>
                    {topicOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={`${index + 1}-mavzu ulushi (%)`}
                    inputMode="numeric"
                    className="w-20"
                    value={topic.percent}
                    onChange={(event) => patch({ topics: draft.topics.map((row, position) => (position === index ? { ...row, percent: event.target.value } : row)) })}
                  />
                  <span className="text-sm text-fg-muted">%</span>
                  <Button
                    variant="ghost"
                    aria-label={`${index + 1}-mavzuni olib tashlash`}
                    onClick={() => patch({ topics: draft.topics.filter((_, position) => position !== index) })}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              className="mt-2"
              leftIcon={<Plus className="size-4" aria-hidden />}
              disabled={!courseId || draft.topics.length >= 30}
              onClick={() => patch({ topics: [...draft.topics, { topicId: '', percent: '' }] })}
            >
              Mavzu qo‘shish
            </Button>
          </div>

          <div>
            <Checkbox label="Qiyinlik ulushini belgilash" checked={draft.useDifficulty} onChange={(event) => patch({ useDifficulty: event.target.checked })} />
            {draft.useDifficulty && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {LEVELS.map((level) => (
                  <FormField key={level} label={`${DIFFICULTY_LABELS[level]} (%)`} htmlFor={`blueprint-${level}`}>
                    <Input
                      id={`blueprint-${level}`}
                      inputMode="numeric"
                      value={draft.difficulty[level]}
                      onChange={(event) => patch({ difficulty: { ...draft.difficulty, [level]: event.target.value } })}
                    />
                  </FormField>
                ))}
              </div>
            )}
          </div>

          {parsed.error ? (
            <p className="text-sm text-red-600 dark:text-red-400">{parsed.error}</p>
          ) : (
            <Button
              variant="secondary"
              leftIcon={<SearchCheck className="size-4" aria-hidden />}
              disabled={!groupId}
              loading={preview.isPending}
              onClick={() => preview.mutate()}
            >
              Bankni tekshirish
            </Button>
          )}

          {preview.isError && <Alert tone="error">{getErrorMessage(preview.error)}</Alert>}
          {preview.data && (
            <div className="space-y-2">
              <Alert tone={preview.data.feasible ? 'success' : 'warning'}>
                {preview.data.feasible
                  ? `Bankda ${preview.data.poolSize} ta mos savol bor — variant tuziladi.`
                  : `${preview.data.message ?? 'Savollar yetarli emas'}. Savol qo‘shing yoki ulushlarni o‘zgartiring.`}
              </Alert>
              <ul className="space-y-1 text-sm" aria-label="Blueprint kataklari">
                {preview.data.cells.map((cell) => (
                  <li key={`${cell.topicId}-${cell.difficulty}`} className="flex items-center justify-between gap-2">
                    <span className="text-fg-muted">
                      {cell.topicTitle}
                      {cell.difficulty ? ` · ${DIFFICULTY_LABELS[cell.difficulty]}` : ''}
                    </span>
                    <span className={cn('tabular-nums', cell.available < cell.target ? 'text-amber-600 dark:text-amber-400' : 'text-fg')}>
                      {cell.target} kerak / {cell.available} bor
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
