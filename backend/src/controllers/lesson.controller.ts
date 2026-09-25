import type { Request, Response } from 'express';
import { lessonService } from '../services/lesson.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createLessonSchema, lessonLinkMaterialSchema, lessonListQuerySchema, updateLessonSchema } from '../validators/lesson.validator.js';

function headerTitle(req: Request): string | undefined {
  const raw = req.header('x-material-title');
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const lessonController = {
  async treeForCourse(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const { includeArchived } = lessonListQuerySchema.parse(req.query);
    sendSuccess(res, await lessonService.treeForCourse(requireAuthUser(req), id, includeArchived));
  },

  async getById(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    sendSuccess(res, await lessonService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = createLessonSchema.parse(req.body);
    sendCreated(res, await lessonService.create(requireAuthUser(req), id, input, getClientInfo(req)), 'Dars yaratildi');
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateLessonSchema.parse(req.body);
    sendSuccess(res, await lessonService.update(requireAuthUser(req), id, input, getClientInfo(req)), { message: 'Dars saqlandi' });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await lessonService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Dars o‘chirildi' });
  },

  async addLink(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = lessonLinkMaterialSchema.parse(req.body);
    sendCreated(res, await lessonService.addLinkMaterial(requireAuthUser(req), id, input, getClientInfo(req)), 'Material qo‘shildi');
  },

  async upload(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const material = await lessonService.uploadMaterial(
      requireAuthUser(req),
      id,
      { buffer: req.body, fileName: req.header('x-file-name'), title: headerTitle(req) },
      getClientInfo(req),
    );
    sendCreated(res, material, 'Fayl yuklandi');
  },

  async removeMaterial(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await lessonService.removeMaterial(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, null, { message: 'Material o‘chirildi' });
  },

  async downloadMaterial(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await sendStoredFile(res, await lessonService.materialFile(id));
  },
};
