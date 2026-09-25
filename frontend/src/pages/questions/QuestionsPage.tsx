import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { HelpCircle, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Table, TBody, TD, TH, THead, TR, TableContainer, TableSkeleton } from '@/components/ui/Table';
import { useDebounce } from '@/hooks/useDebounce';
import { usePermission } from '@/hooks/usePermission';
import { queryKeys } from '@/lib/queryKeys';
import { coursesService } from '@/services/courses.service';
import { questionsService } from '@/services/questions.service';
import type { Question, QuestionDifficulty } from '@/types/question';
import { PERMISSIONS } from '@/utils/permissionKeys';
import { QuestionFormModal } from './QuestionFormModal';
import { QUESTION_TYPE_SHORT } from '@/utils/questionLabels';

const PAGE_SIZE = 20;

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = { EASY: 'Oson', MEDIUM: 'O‘rtacha', HARD: 'Qiyin' };
const DIFFICULTY_TONES: Record<QuestionDifficulty, 'green' | 'yellow' | 'red'> = {
  EASY: 'green',
  MEDIUM: 'yellow',
  HARD: 'red',
};

export default function QuestionsPage() {
  const queryClient = useQueryClient();
  const canManage = usePermission(PERMISSIONS.EXAM_MANAGE);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [courseId, setCourseId] = useState('');
  const [difficulty, setDifficulty] = useState<QuestionDifficulty | ''>('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ question?: Question } | null>(null);

  const coursesQuery = useQuery({
    queryKey: queryKeys.courses.list({ page: 1, limit: 100 }),
    queryFn: () => coursesService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60_000,
  });

  const params = {
    page,
    limit: PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(courseId ? { courseId } : {}),
    ...(difficulty ? { difficulty } : {}),
  };
  const questionsQuery = useQuery({
    queryKey: queryKeys.questions.list(params),
    queryFn: () => questionsService.list(params),
    placeholderData: keepPreviousData,
  });

  const courses = (coursesQuery.data?.items ?? []).map((course) => ({ id: course.id, name: course.name }));

  return (
    <>
      <PageHeader
        title="Savollar bazasi"
        documentTitle="Savollar bazasi"
        description="Imtihon savollari: mavzu, murakkablik va ball bo‘yicha"
        actions={
          canManage &&
          courses.length > 0 && (
            <Button leftIcon={<Plus className="size-4" aria-hidden />} onClick={() => setDialog({})}>
              Savol qo‘shish
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput
          value={searchInput}
          onChange={(value) => {
            setSearchInput(value);
            setPage(1);
          }}
          placeholder="Savol matni bo‘yicha"
          className="sm:max-w-xs"
        />
        <Select
          value={courseId}
          onChange={(event) => {
            setCourseId(event.target.value);
            setPage(1);
          }}
          aria-label="Kurs"
          wrapperClassName="sm:w-52"
        >
          <option value="">Barcha kurslar</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name}
            </option>
          ))}
        </Select>
        <Select
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value as QuestionDifficulty | '');
            setPage(1);
          }}
          aria-label="Murakkablik"
          wrapperClassName="sm:w-40"
        >
          <option value="">Murakkablik: barchasi</option>
          {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {questionsQuery.isPending ? (
        <TableSkeleton columns={5} />
      ) : questionsQuery.isError ? (
        <ErrorState error={questionsQuery.error} onRetry={() => void questionsQuery.refetch()} />
      ) : questionsQuery.data.items.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="Savol topilmadi"
          description="Savollar bazasini to‘ldiring — keyin imtihonga tasodifiy tanlash orqali qo‘shishingiz mumkin."
        />
      ) : (
        <>
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Savol</TH>
                  <TH>Mavzu</TH>
                  <TH>Turi</TH>
                  <TH>Ball</TH>
                  <TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {questionsQuery.data.items.map((question) => (
                  <TR key={question.id}>
                    <TD>
                      <p className="max-w-md truncate text-fg">{question.text}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={DIFFICULTY_TONES[question.difficulty]}>{DIFFICULTY_LABELS[question.difficulty]}</Badge>
                        {question.usedInExams > 0 && (
                          <span className="text-xs text-fg-subtle">{question.usedInExams} ta imtihonda</span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-fg-muted">{question.topicTitle ?? '—'}</TD>
                    <TD className="text-fg-muted">{QUESTION_TYPE_SHORT[question.type]}</TD>
                    <TD className="tabular-nums">{question.points}</TD>
                    <TD className="text-right">
                      {canManage && (
                        <Button variant="ghost" aria-label="Tahrirlash" onClick={() => setDialog({ question })}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
          <Pagination
            page={questionsQuery.data.meta.page}
            totalPages={questionsQuery.data.meta.totalPages}
            total={questionsQuery.data.meta.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {dialog && (
        <QuestionFormModal
          question={dialog.question}
          courses={courses}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.questions.all });
          }}
        />
      )}
    </>
  );
}
