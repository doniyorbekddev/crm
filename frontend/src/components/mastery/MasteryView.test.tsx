import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StudentMastery } from '@/types/mastery';
import { MasteryView } from './MasteryView';

const MASTERY: StudentMastery = {
  studentId: 'st1',
  courseId: 'c1',
  settings: { thresholds: { developing: 40, good: 60, mastered: 80 }, weights: { exam: 50, homework: 30, attendance: 10, lessons: 10 } },
  overall: { score: 71, mastered: 1, practicing: 0, learning: 2, notStarted: 1, topics: 4 },
  modules: [
    {
      id: 'm1',
      title: 'JavaScript asoslari',
      score: 71,
      topics: [
        {
          topicId: 't1',
          title: 'Massivlar',
          score: 92,
          status: 'MASTERED',
          level: 'MASTERED',
          sources: { exam: 90, homework: 95, attendance: null, lessons: null },
          evidence: { examQuestions: 4, homework: 1, sessions: 0, lessons: 0 },
          calculatedAt: '2026-09-26T00:00:00.000Z',
        },
        {
          topicId: 't2',
          title: 'Funksiyalar',
          score: 50,
          status: 'LEARNING',
          level: 'DEVELOPING',
          sources: { exam: 50, homework: null, attendance: 100, lessons: null },
          evidence: { examQuestions: 2, homework: 0, sessions: 1, lessons: 0 },
          calculatedAt: null,
        },
        {
          topicId: 't3',
          title: 'DOM',
          score: null,
          status: 'LEARNING',
          level: null,
          sources: { exam: null, homework: null, attendance: 100, lessons: null },
          evidence: { examQuestions: 0, homework: 0, sessions: 1, lessons: 0 },
          calculatedAt: null,
        },
        {
          topicId: 't4',
          title: 'Async',
          score: null,
          status: 'NOT_STARTED',
          level: null,
          sources: { exam: null, homework: null, attendance: null, lessons: null },
          evidence: { examQuestions: 0, homework: 0, sessions: 0, lessons: 0 },
          calculatedAt: null,
        },
      ],
    },
  ],
};

/** O'zlashtirish ko'rinishi — xodim profili va kabinetda bir xil */
describe('MasteryView', () => {
  it('mavzular bahosi, holati, manbalari va umumiy ko‘rsatkich', () => {
    render(<MasteryView mastery={MASTERY} />);
    expect(screen.getByText('71%', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Massivlar o‘zlashtirish' })).toHaveAttribute('aria-valuenow', '92');
    expect(screen.getByRole('meter', { name: 'Funksiyalar o‘zlashtirish' })).toHaveAttribute('aria-valuetext', '50% — Rivojlanmoqda');
    expect(screen.getByText('imtihon 90% · vazifa 95%')).toBeInTheDocument();
    // Faqat davomat — baho yo'q, lekin "o'rganilmoqda"
    expect(screen.getByRole('meter', { name: 'DOM o‘zlashtirish' })).toHaveAttribute('aria-valuetext', 'baho yo‘q');
    expect(screen.getByText('Hali ma’lumot yo‘q')).toBeInTheDocument();
    expect(screen.getAllByText('O‘rganilmoqda').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Oylik progress')).not.toBeInTheDocument();
  });

  it('oylik tarix jadvali', () => {
    render(
      <MasteryView
        mastery={MASTERY}
        history={[{ month: '2026-08', attendanceRate: 90, homeworkRate: 80, averageScore: 75, masteryScore: 64, topicsMastered: 1, totalXp: 300, levelNumber: 2 }]}
      />,
    );
    expect(screen.getByText('Oylik progress')).toBeInTheDocument();
    expect(screen.getByText('Avg 2026')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
  });
});
