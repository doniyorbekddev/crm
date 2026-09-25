import type { Request, Response } from 'express';
import { aiAcademicService } from '../services/ai/academic.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import { acceptAnalysisSchema, remedialSchema } from '../validators/aiAcademic.validator.js';

function submissionParams(req: Request): { homeworkId: string; studentId: string } {
  return {
    homeworkId: idParamSchema.parse({ id: req.params.homeworkId }).id,
    studentId: idParamSchema.parse({ id: req.params.studentId }).id,
  };
}

export const aiAcademicController = {
  status(_req: Request, res: Response): void {
    sendSuccess(res, aiAcademicService.status());
  },

  async latestStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await aiAcademicService.latestStudent(requireAuthUser(req), id));
  },

  async analyzeStudent(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendCreated(res, await aiAcademicService.analyzeStudent(requireAuthUser(req), id, getClientInfo(req)), 'Tahlil tayyor');
  },

  async latestGroup(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await aiAcademicService.latestGroup(requireAuthUser(req), id));
  },

  async analyzeGroup(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendCreated(res, await aiAcademicService.analyzeGroup(requireAuthUser(req), id, getClientInfo(req)), 'Tahlil tayyor');
  },

  async latestReview(req: Request, res: Response): Promise<void> {
    const { homeworkId, studentId } = submissionParams(req);
    sendSuccess(res, await aiAcademicService.latestReview(requireAuthUser(req), homeworkId, studentId));
  },

  async reviewSubmission(req: Request, res: Response): Promise<void> {
    const { homeworkId, studentId } = submissionParams(req);
    sendCreated(res, await aiAcademicService.reviewSubmission(requireAuthUser(req), homeworkId, studentId, getClientInfo(req)), 'Tekshiruv tayyor');
  },

  async similarity(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await aiAcademicService.homeworkSimilarity(requireAuthUser(req), id));
  },

  async remedial(req: Request, res: Response): Promise<void> {
    const input = remedialSchema.parse(req.body);
    sendCreated(res, await aiAcademicService.proposeRemedial(requireAuthUser(req), input, getClientInfo(req)), 'Remedial reja tayyor');
  },

  async accept(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = acceptAnalysisSchema.parse(req.body ?? {});
    sendSuccess(res, await aiAcademicService.accept(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Tasdiqlandi' });
  },

  async reject(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await aiAcademicService.reject(requireAuthUser(req), id, getClientInfo(req)), { message: 'Rad etildi' });
  },
};
