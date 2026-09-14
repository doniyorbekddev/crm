import { Router, raw } from 'express';
import { env } from '../config/env.js';
import { documentController } from '../controllers/document.controller.js';
import { authenticate } from '../middleware/authenticate.js';

/** Fayl so‘rov tanasida xom holda keladi; hajm chegarasi MAX_UPLOAD_MB (oshsa — 413) */
export const uploadBody = raw({ type: () => true, limit: env.MAX_UPLOAD_MB * 1024 * 1024 });

export const documentRouter = Router();

documentRouter.use(authenticate);

// Ruxsat hujjat bog'langan yozuvga qarab servisda tekshiriladi
documentRouter.get('/:id/download', documentController.download);
documentRouter.patch('/:id', documentController.update);
documentRouter.delete('/:id', documentController.remove);
