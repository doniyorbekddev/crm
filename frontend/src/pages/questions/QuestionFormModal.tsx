import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { getErrorMessage } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { curriculumService } from '@/services/curriculum.service';
import { questionsService } from '@/services/questions.service';
import type { Question, QuestionDifficulty, QuestionType } from '@/types/question';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS, isChoiceQuestion } from '@/utils/questionLabels';

interface Draft {
  text: string;
  isCorrect: boolean;
}

interface QuestionFormModalProps {
  question?: Question;
  courses: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

const TRUE_FALSE_OPTIONS: Draft[] = [
  { text: 'To‘g‘ri', isCorrect: true },
  { text: 'Noto‘g‘ri', isCorrect: false },
];

/** "a, b\nc" → ["a", "b", "c"] — teglar va qabul qilinadigan javoblar uchun */
function splitList(value: string, separator: RegExp): string[] {
  return [...new Set(value.split(separator).map((item) => item.trim()).filter(Boolean))];
}

export function QuestionFormModal({ question, courses, onClose, onSaved }: QuestionFormModalProps) {
  const [courseId, setCourseId] = useState(question?.courseId ?? courses[0]?.id ?? '');
  const [topicId, setTopicId] = useState(question?.topicId ?? '');
  const [text, setText] = useState(question?.text ?? '');
  const [type, setType] = useState<QuestionType>(question?.type ?? 'SINGLE_CHOICE');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>(question?.difficulty ?? 'MEDIUM');
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [options, setOptions] = useState<Draft[]>(
    question?.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect ?? false })) ?? [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
    ],
  );
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [tags, setTags] = useState((question?.tags ?? []).join(', '));
  const [accepted, setAccepted] = useState((question?.acceptedAnswers ?? []).join('\n'));
  const [formError, setFormError] = useState<string | null>(null);
  const choice = isChoiceQuestion(type);

  const curriculumQuery = useQuery({
    queryKey: queryKeys.curriculum.course(courseId),
    queryFn: () => curriculumService.forCourse(courseId),
    enabled: Boolean(courseId),
  });
  const topics = (curriculumQuery.data?.modules ?? []).flatMap((module) =>
    module.topics.map((topic) => ({ id: topic.id, label: `${module.title} · ${topic.title}` })),
  );

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        text: text.trim(),
        type,
        difficulty,
        points: Number(points),
        ...(topicId ? { topicId } : {}),
        ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
        tags: splitList(tags, /,/),
        acceptedAnswers: type === 'SHORT_TEXT' ? splitList(accepted, /\n/) : [],
        options: choice ? options.filter((option) => option.text.trim()).map((option) => ({ text: option.text.trim(), isCorrect: option.isCorrect })) : [],
      };
      return question ? questionsService.update(question.id, payload) : questionsService.create({ ...payload, courseId });
    },
    onSuccess: (result) => {
      toast.success(result.message);
      onSaved();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  function changeType(next: QuestionType) {
    setType(next);
    // To'g'ri/noto'g'ri — variantlar qat'iy, faqat qaysi biri to'g'ri tanlanadi
    if (next === 'TRUE_FALSE') setOptions(TRUE_FALSE_OPTIONS);
    else if (type === 'TRUE_FALSE') setOptions([{ text: '', isCorrect: true }, { text: '', isCorrect: false }]);
  }

  function setOption(index: number, patch: Partial<Draft>) {
    setOptions((current) =>
      current.map((option, position) => {
        if (position !== index) {
          // Bitta javobli savolda faqat bitta variant to'g'ri bo'ladi
          return type !== 'MULTIPLE_CHOICE' && patch.isCorrect ? { ...option, isCorrect: false } : option;
        }
        return { ...option, ...patch };
      }),
    );
  }

  return (
    <Modal
      open
      size="lg"
      title={question ? 'Savolni tahrirlash' : 'Savol qo‘shish'}
      onClose={onClose}
      closeDisabled={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Bekor qilish
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={text.trim().length < 5 || !courseId}>
            Saqlash
          </Button>
        </>
      }
    >
      {formError && (
        <Alert tone="error" className="mb-4">
          {formError}
        </Alert>
      )}

      <div className="space-y-4">
        {!question && (
          <FormField label="Kurs" htmlFor="question-course">
            <Select id="question-course" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}

        <FormField label="Mavzu" htmlFor="question-topic" hint="Mavzu belgilansa, natija mavzular kesimida tahlil qilinadi">
          <Select id="question-topic" value={topicId} onChange={(event) => setTopicId(event.target.value)}>
            <option value="">Mavzusiz</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Savol matni" htmlFor="question-text">
          <Textarea id="question-text" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Turi" htmlFor="question-type">
            <Select id="question-type" value={type} onChange={(event) => changeType(event.target.value as QuestionType)}>
              {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Murakkabligi" htmlFor="question-difficulty">
            <Select
              id="question-difficulty"
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}
            >
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Ball" htmlFor="question-points">
            <Input id="question-points" type="number" min={1} max={100} value={points} onChange={(event) => setPoints(event.target.value)} />
          </FormField>
        </div>

        {choice && (
          <div>
            <p className="mb-2 text-sm font-medium text-fg">{type === 'TRUE_FALSE' ? 'To‘g‘ri javobni belgilang' : 'Variantlar'}</p>
            <ul className="space-y-2">
              {options.map((option, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Checkbox
                    checked={option.isCorrect}
                    aria-label={`${index + 1}-variant to‘g‘ri`}
                    onChange={(event) => setOption(index, { isCorrect: event.target.checked })}
                  />
                  <Input
                    value={option.text}
                    placeholder={`${index + 1}-variant`}
                    aria-label={`${index + 1}-variant matni`}
                    readOnly={type === 'TRUE_FALSE'}
                    onChange={(event) => setOption(index, { text: event.target.value })}
                  />
                  {options.length > 2 && type !== 'TRUE_FALSE' && (
                    <Button
                      variant="ghost"
                      aria-label={`${index + 1}-variantni o‘chirish`}
                      onClick={() => setOptions((current) => current.filter((_, position) => position !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {type !== 'TRUE_FALSE' && (
              <Button
                variant="secondary"
                className="mt-2"
                leftIcon={<Plus className="size-4" aria-hidden />}
                disabled={options.length >= 10}
                onClick={() => setOptions((current) => [...current, { text: '', isCorrect: false }])}
              >
                Variant qo‘shish
              </Button>
            )}
          </div>
        )}

        {type === 'SHORT_TEXT' && (
          <FormField
            label="Qabul qilinadigan javoblar"
            htmlFor="question-accepted"
            hint="Har qatorga bitta. Katta-kichik harf va ortiqcha bo‘shliq hisobga olinmaydi; mos kelmagan javobni o‘qituvchi ko‘radi"
          >
            <Textarea id="question-accepted" rows={3} value={accepted} onChange={(event) => setAccepted(event.target.value)} />
          </FormField>
        )}

        {!choice && type !== 'SHORT_TEXT' && (
          <Alert tone="info">Bu turdagi javobni o‘qituvchi tekshiradi — urinish “Baholash kerak” holatiga o‘tadi.</Alert>
        )}

        <FormField label="Tushuntirish" htmlFor="question-explanation" hint="Natija e’lon qilingach o‘quvchiga ko‘rsatiladi (ixtiyoriy)">
          <Textarea id="question-explanation" rows={2} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
        </FormField>

        <FormField label="Teglar" htmlFor="question-tags" hint="Vergul bilan: massiv, sikl">
          <Input id="question-tags" value={tags} onChange={(event) => setTags(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
