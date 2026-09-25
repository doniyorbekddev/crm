import type { Request, Response } from 'express';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import { portalService } from '../services/portal.service.js';
import { portalAccountService } from '../services/portalAccount.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  bulkParentPortalAccountsSchema,
  bulkPortalAccountsSchema,
  portalCalendarQuerySchema,
  portalChildQuerySchema,
  portalHomeworkSubmitSchema,
  studentPortalAccountSchema,
  lessonCompleteSchema,
  weeklyReportQuerySchema,
} from '../validators/portal.validator.js';
import { portalFeedbackSchema } from '../validators/feedback.validator.js';

export const portalController = {
  async me(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await portalService.me(requireAuthUser(req)));
  },

  async profile(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.profile(requireAuthUser(req), studentId));
  },

  async schedule(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.schedule(requireAuthUser(req), studentId));
  },

  /** Kelgusi darslar va o'qituvchi */
  async lessons(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.lessons(requireAuthUser(req), studentId));
  },

  /** Kurs dasturi bo'yicha progress */
  async curriculum(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.curriculum(requireAuthUser(req), studentId));
  },

  /** O'quvchining sertifikatlari */
  async certificates(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.certificates(requireAuthUser(req), studentId));
  },

  async homework(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.homework(requireAuthUser(req), studentId));
  },

  async exams(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.exams(requireAuthUser(req), studentId));
  },

  async attendanceCalendar(req: Request, res: Response): Promise<void> {
    const { studentId, year, month } = portalCalendarQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.attendanceCalendar(requireAuthUser(req), { year, month }, studentId));
  },

  async gamification(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.gamification(requireAuthUser(req), studentId));
  },

  async payments(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.payments(requireAuthUser(req), studentId));
  },

  async submitHomework(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    const input = portalHomeworkSubmitSchema.parse(req.body);
    sendCreated(res, await portalService.submitHomework(requireAuthUser(req), id, input, studentId), 'Vazifa topshirildi');
  },

  async submitHomeworkAttachment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    const result = await portalService.submitHomeworkAttachment(
      requireAuthUser(req),
      id,
      { buffer: req.body, fileName: req.header('x-file-name') },
      studentId,
    );
    sendCreated(res, result, 'Vazifa topshirildi');
  },

  async children(req: Request, res: Response): Promise<void> {
    sendSuccess(res, await portalService.children(requireAuthUser(req)));
  },

  async weeklyReport(req: Request, res: Response): Promise<void> {
    const { studentId, week } = weeklyReportQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.weeklyReport(requireAuthUser(req), week, studentId));
  },

  async overview(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.overview(requireAuthUser(req), studentId));
  },

  async homeworkDetail(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.homeworkDetail(requireAuthUser(req), id, studentId));
  },

  /** O'z faylini yuklab olish — hujjatlar bilan bir xil oqim (stream, no-store) */
  async homeworkAttachment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    await sendStoredFile(res, await portalService.homeworkAttachment(requireAuthUser(req), id, studentId));
  },

  async course(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.course(requireAuthUser(req), studentId));
  },

  async lesson(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.lesson(requireAuthUser(req), id, studentId));
  },

  async completeLesson(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { completed } = lessonCompleteSchema.parse(req.body ?? {});
    sendSuccess(res, await portalService.setLessonCompleted(requireAuthUser(req), id, completed), {
      message: completed ? 'Dars o‘rganildi deb belgilandi' : 'Belgi olib tashlandi',
    });
  },

  async lessonMaterial(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    await sendStoredFile(res, await portalService.lessonMaterial(requireAuthUser(req), id, studentId));
  },

  async examDetail(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.examDetail(requireAuthUser(req), id, studentId));
  },

  async feedbackState(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    sendSuccess(res, await portalService.feedbackState(requireAuthUser(req), studentId));
  },

  async submitFeedback(req: Request, res: Response): Promise<void> {
    const { studentId } = portalChildQuerySchema.parse(req.query);
    const input = portalFeedbackSchema.parse(req.body);
    sendCreated(res, await portalService.submitFeedback(requireAuthUser(req), input, studentId), 'Fikringiz uchun rahmat');
  },

  async createStudentAccount(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { email } = studentPortalAccountSchema.parse(req.body ?? {});
    sendCreated(
      res,
      await portalAccountService.createForStudent(requireAuthUser(req), id, email, getClientInfo(req)),
      'Kabinet ochildi — login va parolni o‘quvchiga yetkazing',
    );
  },

  async bulkCreateStudentAccounts(req: Request, res: Response): Promise<void> {
    const input = bulkPortalAccountsSchema.parse(req.body ?? {});
    const result = await portalAccountService.bulkCreateForStudents(requireAuthUser(req), input, getClientInfo(req));
    sendCreated(res, result, result.created.length ? `${result.created.length} ta kabinet ochildi` : 'Yangi kabinet ochilmadi — hammasida bor');
  },

  async resetStudentPassword(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await portalAccountService.resetStudentPassword(requireAuthUser(req), id, getClientInfo(req)), {
      message: 'Yangi parol yaratildi — o‘quvchiga yetkazing',
    });
  },

  async createParentAccount(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { email } = studentPortalAccountSchema.parse(req.body ?? {});
    sendCreated(
      res,
      await portalAccountService.createForParent(requireAuthUser(req), id, email, getClientInfo(req)),
      'Kabinet ochildi — login va parolni ota-onaga yetkazing',
    );
  },

  async bulkCreateParentAccounts(req: Request, res: Response): Promise<void> {
    const input = bulkParentPortalAccountsSchema.parse(req.body ?? {});
    const result = await portalAccountService.bulkCreateForParents(requireAuthUser(req), input, getClientInfo(req));
    sendCreated(res, result, result.created.length ? `${result.created.length} ta kabinet ochildi` : 'Yangi kabinet ochilmadi');
  },

  async resetParentPassword(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await portalAccountService.resetParentPassword(requireAuthUser(req), id, getClientInfo(req)), {
      message: 'Yangi parol yaratildi — ota-onaga yetkazing',
    });
  },
};
