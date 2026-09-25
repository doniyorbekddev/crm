import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuestionFormModal } from './QuestionFormModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/questions.service', () => ({ questionsService: { create: vi.fn(), update: vi.fn() } }));
vi.mock('@/services/curriculum.service', () => ({ curriculumService: { forCourse: vi.fn().mockResolvedValue({ modules: [] }) } }));

const { questionsService } = await import('@/services/questions.service');

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuestionFormModal courses={[{ id: 'c1', name: 'Frontend' }]} onClose={() => {}} onSaved={() => {}} />
    </QueryClientProvider>,
  );
}

/** Yangi savol turlari: to'g'ri/noto'g'ri, qisqa javob, qo'lda baholanadigan turlar */
describe('QuestionFormModal', () => {
  beforeEach(() => {
    vi.mocked(questionsService.create).mockReset().mockResolvedValue({ data: {} as never, message: 'Savol qo‘shildi' });
  });

  it('to‘g‘ri/noto‘g‘ri — qat‘iy ikki variant, bittasi tanlanadi', async () => {
    renderForm();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Turi'), 'TRUE_FALSE');
    expect(screen.getByLabelText('1-variant matni')).toHaveValue('To‘g‘ri');
    expect(screen.getByLabelText('2-variant matni')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Variant qo‘shish' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('2-variant to‘g‘ri'));
    await user.type(screen.getByLabelText('Savol matni'), 'const qayta tayinlanadi');
    await user.type(screen.getByLabelText('Tushuntirish'), 'const — o‘zgarmas bog‘lanish');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(questionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TRUE_FALSE',
          explanation: 'const — o‘zgarmas bog‘lanish',
          options: [
            { text: 'To‘g‘ri', isCorrect: false },
            { text: 'Noto‘g‘ri', isCorrect: true },
          ],
        }),
      ),
    );
  });

  it('qisqa javob — variantsiz, qabul qilinadigan javoblar va teglar ro‘yxat bo‘lib ketadi', async () => {
    renderForm();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Turi'), 'SHORT_TEXT');
    expect(screen.queryByText('Variantlar')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Savol matni'), 'Oxiriga qo‘shuvchi metod?');
    await user.type(screen.getByLabelText('Qabul qilinadigan javoblar'), 'push{Enter}push(){Enter}push');
    await user.type(screen.getByLabelText('Teglar'), 'massiv, metod');
    await user.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() =>
      expect(questionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SHORT_TEXT', options: [], acceptedAnswers: ['push', 'push()'], tags: ['massiv', 'metod'], courseId: 'c1' }),
      ),
    );
  });

  it('kod savoli — o‘qituvchi tekshirishi haqida ogohlantirish', async () => {
    renderForm();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Turi'), 'CODE');
    expect(screen.getByText(/o‘qituvchi tekshiradi/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Qabul qilinadigan javoblar')).not.toBeInTheDocument();
  });
});
