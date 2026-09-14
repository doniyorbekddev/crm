import { createHash } from 'node:crypto';
import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, removeStoredFile, resolveStoredPath, sanitizeFileName, saveFile } from '../utils/fileStorage.js';
import type { ClientInfo } from '../utils/requestContext.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

/**
 * Hujjatlar (promt 19, 20, 56-bo‘limlar): xarajat va tushum cheklari. Fayl ochiq URL orqali berilmaydi —
 * yuklab olishda bog‘langan yozuvni ko‘rish ruxsati tekshiriladi. O‘chirilgan hujjat tarixda qoladi.
 */

export type DocumentOwner = 'expense' | 'income';

const MAX_PER_ENTITY = 10;

const OWNER_PERMISSIONS: Record<DocumentOwner | 'lead' | 'student', { view: PermissionKey; manage: PermissionKey }> = {
  expense: { view: PERMISSIONS.EXPENSE_VIEW, manage: PERMISSIONS.EXPENSE_MANAGE },
  income: { view: PERMISSIONS.INCOME_VIEW, manage: PERMISSIONS.INCOME_MANAGE },
  lead: { view: PERMISSIONS.LEAD_VIEW, manage: PERMISSIONS.LEAD_UPDATE },
  student: { view: PERMISSIONS.STUDENT_VIEW, manage: PERMISSIONS.STUDENT_MANAGE },
};

export interface DocumentDto {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

const documentSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DocumentSelect;

type DocumentRecord = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

function toDto(document: DocumentRecord): DocumentDto {
  return { ...document, createdAt: document.createdAt.toISOString() };
}

const ownerWhere = (owner: DocumentOwner, entityId: string): Prisma.DocumentWhereInput =>
  owner === 'expense' ? { expenseId: entityId } : { incomeId: entityId };

async function assertOwnerExists(owner: DocumentOwner, entityId: string): Promise<void> {
  const exists = owner === 'expense' ? await prisma.expense.count({ where: { id: entityId } }) : await prisma.income.count({ where: { id: entityId } });
  if (!exists) {
    throw AppError.notFound(owner === 'expense' ? 'Xarajat topilmadi' : 'Tushum topilmadi');
  }
}

function ownerOf(document: { expenseId: string | null; incomeId: string | null; leadId: string | null; studentId: string | null }) {
  if (document.expenseId) return { key: 'expense' as const, id: document.expenseId };
  if (document.incomeId) return { key: 'income' as const, id: document.incomeId };
  if (document.leadId) return { key: 'lead' as const, id: document.leadId };
  if (document.studentId) return { key: 'student' as const, id: document.studentId };
  return null;
}

async function assertPermission(actor: AuthUser, key: PermissionKey): Promise<void> {
  const permissions = await permissionService.getRolePermissions(actor.roleId);
  if (!permissions.has(key)) {
    throw AppError.forbidden();
  }
}

async function findActive(id: string) {
  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, storagePath: true, originalName: true, mimeType: true, size: true, expenseId: true, incomeId: true, leadId: true, studentId: true },
  });
  if (!document) {
    throw AppError.notFound('Hujjat topilmadi');
  }
  return document;
}

export const documentService = {
  async list(owner: DocumentOwner, entityId: string): Promise<DocumentDto[]> {
    await assertOwnerExists(owner, entityId);
    const documents = await prisma.document.findMany({
      where: { ...ownerWhere(owner, entityId), deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: documentSelect,
    });
    return documents.map(toDto);
  },

  async upload(
    actor: AuthUser,
    owner: DocumentOwner,
    entityId: string,
    file: { buffer: unknown; fileName: string | undefined },
    client: ClientInfo,
  ): Promise<DocumentDto> {
    await assertOwnerExists(owner, entityId);
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw AppError.unprocessable('Fayl yuborilmadi');
    }
    const buffer = file.buffer;
    const type = detectFileType(buffer);
    if (!type) {
      throw AppError.unprocessable('Faqat JPG, PNG, WEBP yoki PDF fayl biriktirish mumkin');
    }
    const where = { ...ownerWhere(owner, entityId), deletedAt: null };
    if ((await prisma.document.count({ where })) >= MAX_PER_ENTITY) {
      throw AppError.unprocessable(`Bitta yozuvga eng ko‘pi ${MAX_PER_ENTITY} ta fayl biriktiriladi`);
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    if (await prisma.document.findFirst({ where: { ...where, sha256 }, select: { id: true } })) {
      throw AppError.conflict('Bu fayl allaqachon biriktirilgan');
    }

    const originalName = sanitizeFileName(file.fileName, type.ext);
    const storagePath = await saveFile(buffer, type.ext);
    try {
      const document = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            ...(owner === 'expense' ? { expenseId: entityId } : { incomeId: entityId }),
            originalName,
            mimeType: type.mime,
            size: buffer.length,
            storagePath,
            sha256,
            uploadedById: actor.id,
          },
          select: documentSelect,
        });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'document.uploaded',
          entityType: owner,
          entityId,
          metadata: { document: created.id, name: originalName, mimeType: type.mime, size: buffer.length },
          ...client,
        });
        return created;
      });
      return toDto(document);
    } catch (error) {
      // Baza yozuvi yaratilmasa — diskda yetim fayl qolmasin
      await removeStoredFile(storagePath);
      throw error;
    }
  },

  /** Yuklab olish: bog‘langan yozuvni ko‘rish ruxsati bo‘lsa */
  async download(actor: AuthUser, id: string): Promise<{ absolutePath: string; originalName: string; mimeType: string; size: number }> {
    const document = await findActive(id);
    const owner = ownerOf(document);
    if (!owner) {
      throw AppError.forbidden();
    }
    await assertPermission(actor, OWNER_PERMISSIONS[owner.key].view);
    return {
      absolutePath: resolveStoredPath(document.storagePath),
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
    };
  },

  /** O‘chirish yumshoq: yozuv va fayl saqlanadi, ro‘yxatda ko‘rinmaydi */
  async remove(actor: AuthUser, id: string, client: ClientInfo): Promise<void> {
    const document = await findActive(id);
    const owner = ownerOf(document);
    if (!owner) {
      throw AppError.forbidden();
    }
    await assertPermission(actor, OWNER_PERMISSIONS[owner.key].manage);
    await prisma.$transaction(async (tx) => {
      await tx.document.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'document.deleted',
        entityType: owner.key,
        entityId: owner.id,
        metadata: { document: id, name: document.originalName },
        ...client,
      });
    });
  },
};
