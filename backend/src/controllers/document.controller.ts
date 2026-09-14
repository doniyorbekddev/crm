import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Request, Response } from 'express';
import { documentService } from '../services/document.service.js';
import type { DocumentOwner } from '../services/document.service.js';
import { AppError } from '../utils/AppError.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { contentDisposition } from '../utils/fileStorage.js';
import { getClientInfo, requireAuthUser } from '../utils/requestContext.js';
import { idParamSchema } from '../validators/common.validator.js';

/** Xarajat / tushum cheklari: ro‘yxat va yuklash (fayl so‘rov tanasida, nomi X-File-Name sarlavhasida) */
export function attachmentController(owner: DocumentOwner) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const { id } = idParamSchema.parse(req.params);
      sendSuccess(res, await documentService.list(owner, id));
    },

    async upload(req: Request, res: Response): Promise<void> {
      const { id } = idParamSchema.parse(req.params);
      const document = await documentService.upload(
        requireAuthUser(req),
        owner,
        id,
        { buffer: req.body, fileName: req.header('x-file-name') },
        getClientInfo(req),
      );
      sendCreated(res, document, 'Fayl biriktirildi');
    },
  };
}

export const documentController = {
  async download(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    const file = await documentService.download(requireAuthUser(req), id);
    try {
      await stat(file.absolutePath);
    } catch {
      throw AppError.notFound('Fayl saqlash joyida topilmadi');
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', contentDisposition(file.originalName));
    res.setHeader('Cache-Control', 'private, no-store');
    const stream = createReadStream(file.absolutePath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = idParamSchema.parse(req.params);
    await documentService.remove(requireAuthUser(req), id, getClientInfo(req));
    sendSuccess(res, { id }, { message: 'Fayl o‘chirildi' });
  },
};
