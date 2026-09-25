import type { Request, Response } from 'express';
import { documentService } from '../services/document.service.js';
import type { DocumentOwner } from '../services/document.service.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { sendStoredFile } from '../utils/sendStoredFile.js';
import { idParamSchema } from '../validators/common.validator.js';
import { staffDocumentMetaSchema, updateDocumentSchema } from '../validators/document.validator.js';

/**
 * Biriktirilgan fayllar: ro‘yxat va yuklash (fayl so‘rov tanasida, nomi X-File-Name sarlavhasida).
 * O‘qituvchi va xodim hujjatlarining turi, nomi va muddati so‘rov satrida keladi.
 */
export function attachmentController(owner: DocumentOwner) {
  const staff = owner === 'teacher' || owner === 'employee';
  return {
    async list(req: Request, res: Response): Promise<void> {
      const { id } = idParamSchema.parse(req.params);
      sendSuccess(res, await documentService.list(owner, id));
    },

    async upload(req: Request, res: Response): Promise<void> {
      const { id } = idParamSchema.parse(req.params);
      const meta = staff ? staffDocumentMetaSchema.parse(req.query) : null;
      const document = await documentService.upload(
        requireAuthUser(req),
        owner,
        id,
        { buffer: req.body, fileName: req.header('x-file-name') },
        meta,
        getClientInfo(req),
      );
      sendCreated(res, document, 'Fayl biriktirildi');
    },
  };
}

export const documentController = {
  async download(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const file = await documentService.download(requireAuthUser(req), id, getClientInfo(req));
    await sendStoredFile(res, { absolutePath: file.absolutePath, fileName: file.originalName, mimeType: file.mimeType });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const input = updateDocumentSchema.parse(req.body);
    sendSuccess(res, await documentService.update(requireAuthUser(req), id, input, getClientInfo(req)), {
      message: 'Hujjat ma’lumotlari saqlandi',
    });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await documentService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, { id }, { message: 'Fayl o‘chirildi' });
  },
};
