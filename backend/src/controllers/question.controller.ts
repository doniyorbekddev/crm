import type { Request, Response } from 'express';
import { examAttemptService } from '../services/examAttempt.service.js';
import { questionService } from '../services/question.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import {
  attachQuestionsSchema,
  createQuestionSchema,
  gradeAttemptSchema,
  questionListQuerySchema,
  submitAttemptSchema,
  updateQuestionSchema,
} from '../validators/question.validator.js';
import { z } from 'zod';

const studentParamSchema = z.object({ studentId: z.string().trim().min(1).max(50) });

export const questionController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = questionListQuerySchema.parse(req.query);
    const { items, total } = await questionService.list(query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createQuestionSchema.parse(req.body);
    sendCreated(res, await questionService.create(requireAuthUser(req), input, getClientInfo(req)), 'Savol qo‘shildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateQuestionSchema.parse(req.body);
    sendSuccess(res, await questionService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Savol saqlandi',
    });
  },

  async attachToExam(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = attachQuestionsSchema.parse(req.body);
    const result = await examAttemptService.attachQuestions(requireAuthUser(req), id, input, getClientInfo(req));
    sendSuccess(res, result, { message: `${result.attached} ta savol biriktirildi` });
  },

  /** O‘quvchiga ko‘rinadigan savollar — to‘g‘ri javoblarsiz */
  async examQuestions(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await examAttemptService.questionsForStudent(requireAuthUser(req), id));
  },

  /** Imtihonni boshlash — vaqt chegarasi shu yerdan hisoblanadi */
  async startAttempt(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = studentParamSchema.parse(req.params);
    sendSuccess(res, await examAttemptService.start(requireAuthUser(req), id, studentId, getClientInfo(req)), {
      message: 'Imtihon boshlandi',
    });
  },

  async submitAttempt(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = studentParamSchema.parse(req.params);
    const input = submitAttemptSchema.parse(req.body);
    sendCreated(
      res,
      await examAttemptService.submit(requireAuthUser(req), id, studentId, input, getClientInfo(req)),
      'Javoblar qabul qilindi',
    );
  },

  async attempts(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await examAttemptService.listForExam(requireAuthUser(req), id));
  },

  async attempt(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await examAttemptService.getById(requireAuthUser(req), id));
  },

  async answerFile(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const answerId = idParamSchema.parse({ id: req.params.answerId }).id;
    await sendStoredFile(res, await examAttemptService.answerFile(requireAuthUser(req), id, answerId));
  },

  async gradeAttempt(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = gradeAttemptSchema.parse(req.body);
    sendSuccess(res, await examAttemptService.grade(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Baholandi',
    });
  },
};
