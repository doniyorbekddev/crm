import type { Request, Response } from 'express';
import { examService } from '../services/exam.service.js';
import { homeworkService } from '../services/homework.service.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import { idParamSchema } from '../validators/common.validator.js';
import {
  bulkGradeSchema,
  createExamSchema,
  createHomeworkSchema,
  examListQuerySchema,
  gradeSubmissionSchema,
  homeworkLinkSchema,
  homeworkListQuerySchema,
  returnSubmissionSchema,
  saveExamResultsSchema,
  updateExamSchema,
  updateHomeworkSchema,
  blueprintPreviewSchema,
} from '../validators/homework.validator.js';

export const homeworkController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = homeworkListQuerySchema.parse(req.query);
    const { items, total } = await homeworkService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await homeworkService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createHomeworkSchema.parse(req.body);
    sendCreated(res, await homeworkService.create(requireAuthUser(req), input, getClientInfo(req)), 'Uy vazifasi yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateHomeworkSchema.parse(req.body);
    sendSuccess(res, await homeworkService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Uy vazifasi saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await homeworkService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, { id }, { message: 'Uy vazifasi o‘chirildi' });
  },

  async submission(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const studentId = idParamSchema.parse({ id: req.params.studentId }).id;
    sendSuccess(res, await homeworkService.submissionDetail(requireAuthUser(req), id, studentId));
  },

  async submissionFile(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const studentId = idParamSchema.parse({ id: req.params.studentId }).id;
    const fileId = idParamSchema.parse({ id: req.params.fileId }).id;
    await sendStoredFile(res, await homeworkService.submissionFile(requireAuthUser(req), id, studentId, fileId));
  },

  async returnSubmission(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const studentId = idParamSchema.parse({ id: req.params.studentId }).id;
    const input = returnSubmissionSchema.parse(req.body);
    sendSuccess(res, await homeworkService.returnSubmission(requireAuthUser(req), id, studentId, input, getClientInfo(req)), {
      message: 'Qayta ishlashga qaytarildi',
    });
  },

  async addLink(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = homeworkLinkSchema.parse(req.body);
    sendCreated(res, await homeworkService.addLink(requireAuthUser(req), id, input, getClientInfo(req)), 'Havola qo‘shildi');
  },

  async uploadAttachment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const rawTitle = req.header('x-material-title');
    let title: string | undefined;
    try {
      title = rawTitle ? decodeURIComponent(rawTitle) : undefined;
    } catch {
      title = rawTitle;
    }
    const attachment = await homeworkService.uploadAttachment(requireAuthUser(req), id, { buffer: req.body, fileName: req.header('x-file-name'), title }, getClientInfo(req));
    sendCreated(res, attachment, 'Fayl yuklandi');
  },

  async removeAttachment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await homeworkService.removeAttachment(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'O‘chirildi' });
  },

  async downloadAttachment(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await sendStoredFile(res, await homeworkService.attachmentFile(requireAuthUser(req), id));
  },

  async grade(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const studentId = idParamSchema.parse({ id: req.params.studentId }).id;
    const input = gradeSubmissionSchema.parse(req.body);
    sendSuccess(res, await homeworkService.grade(requireAuthUser(req), id, studentId, input, getClientInfo(req)), {
      message: 'Topshiriq saqlandi',
    });
  },

  async bulkGrade(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = bulkGradeSchema.parse(req.body);
    sendSuccess(res, await homeworkService.bulkGrade(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Topshiriqlar saqlandi',
    });
  },
};

export const examController = {
  async previewBlueprint(req: Request, res: Response): Promise<void> {
    const { groupId, blueprint } = blueprintPreviewSchema.parse(req.body);
    sendSuccess(res, await examService.previewBlueprint(requireAuthUser(req), groupId, blueprint));
  },

  async list(req: Request, res: Response): Promise<void> {
    const query = examListQuerySchema.parse(req.query);
    const { items, total } = await examService.list(requireAuthUser(req), query);
    sendSuccess(res, items, { meta: buildPaginationMeta(query.page, query.limit, total) });
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await examService.getById(requireAuthUser(req), id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const input = createExamSchema.parse(req.body);
    sendCreated(res, await examService.create(requireAuthUser(req), input, getClientInfo(req)), 'Imtihon yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateExamSchema.parse(req.body);
    sendSuccess(res, await examService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Imtihon saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await examService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, { id }, { message: 'Imtihon o‘chirildi' });
  },

  async saveResults(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = saveExamResultsSchema.parse(req.body);
    sendSuccess(res, await examService.saveResults(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Natijalar saqlandi',
    });
  },
};
