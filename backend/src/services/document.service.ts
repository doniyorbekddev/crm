import { createHash } from 'node:crypto';
import { prisma } from '../config/database.js';
import { PERMISSIONS } from '../config/permissions.js';
import type { PermissionKey } from '../config/permissions.js';
import type { DocumentCategory, Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { AppError } from '../utils/AppError.js';
import { detectFileType, removeStoredFile, resolveStoredPath, sanitizeFileName, saveFile } from '../utils/fileStorage.js';
import type { ClientInfo } from '../utils/requestContext.js';
import type { StaffDocumentMeta, UpdateDocumentInput } from '../validators/document.validator.js';
import { auditService } from './audit.service.js';
import { permissionService } from './permission.service.js';

/**
 * Hujjatlar (promt 19, 20, 56-bo‘limlar): xarajat va tushum cheklari, o‘qituvchi va xodim hujjatlari
 * (shartnoma, pasport nusxasi, sertifikat). Fayl ochiq URL orqali berilmaydi — yuklab olishda
 * bog‘langan yozuvni ko‘rish ruxsati tekshiriladi. O‘chirilgan hujjat tarixda qoladi.
 */

export type DocumentOwner = 'expense' | 'income' | 'teacher' | 'employee';

type OwnerKey = DocumentOwner | 'lead' | 'student';

interface OwnerConfig {
  field: 'expenseId' | 'incomeId' | 'teacherProfileId' | 'employeeId';
  view: PermissionKey;
  manage: PermissionKey;
  notFound: string;
  maxFiles: number;
  /** Xodim hujjati: turi, nomi va amal qilish muddati bilan */
  staff: boolean;
}

const OWNERS: Record<DocumentOwner, OwnerConfig> = {
  expense: { field: 'expenseId', view: PERMISSIONS.EXPENSE_VIEW, manage: PERMISSIONS.EXPENSE_MANAGE, notFound: 'Xarajat topilmadi', maxFiles: 10, staff: false },
  income: { field: 'incomeId', view: PERMISSIONS.INCOME_VIEW, manage: PERMISSIONS.INCOME_MANAGE, notFound: 'Tushum topilmadi', maxFiles: 10, staff: false },
  teacher: {
    field: 'teacherProfileId',
    view: PERMISSIONS.STAFF_DOCUMENT_VIEW,
    manage: PERMISSIONS.STAFF_DOCUMENT_MANAGE,
    notFound: 'O‘qituvchi topilmadi',
    maxFiles: 30,
    staff: true,
  },
  employee: {
    field: 'employeeId',
    view: PERMISSIONS.STAFF_DOCUMENT_VIEW,
    manage: PERMISSIONS.STAFF_DOCUMENT_MANAGE,
    notFound: 'Xodim topilmadi',
    maxFiles: 30,
    staff: true,
  },
};

const OWNER_PERMISSIONS: Record<OwnerKey, { view: PermissionKey; manage: PermissionKey }> = {
  ...OWNERS,
  lead: { view: PERMISSIONS.LEAD_VIEW, manage: PERMISSIONS.LEAD_UPDATE },
  student: { view: PERMISSIONS.STUDENT_VIEW, manage: PERMISSIONS.STUDENT_MANAGE },
};

/** Tartib: shartnoma, pasport, sertifikat, boshqa */
const CATEGORY_ORDER: Record<DocumentCategory, number> = { CONTRACT: 0, PASSPORT: 1, CERTIFICATE: 2, OTHER: 3, RECEIPT: 4 };

export interface DocumentDto {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  title: string | null;
  /** Amal qilish muddati (YYYY-MM-DD) */
  expiresAt: string | null;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

const documentSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  size: true,
  category: true,
  title: true,
  expiresAt: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DocumentSelect;

type DocumentRecord = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

function toDto(document: DocumentRecord): DocumentDto {
  return {
    ...document,
    expiresAt: document.expiresAt ? document.expiresAt.toISOString().slice(0, 10) : null,
    createdAt: document.createdAt.toISOString(),
  };
}

const ownerWhere = (owner: DocumentOwner, entityId: string): Prisma.DocumentWhereInput => ({ [OWNERS[owner].field]: entityId });

async function assertOwnerExists(owner: DocumentOwner, entityId: string): Promise<void> {
  const count =
    owner === 'expense'
      ? await prisma.expense.count({ where: { id: entityId } })
      : owner === 'income'
        ? await prisma.income.count({ where: { id: entityId } })
        : owner === 'teacher'
          ? await prisma.teacherProfile.count({ where: { id: entityId } })
          : await prisma.employee.count({ where: { id: entityId } });
  if (!count) {
    throw AppError.notFound(OWNERS[owner].notFound);
  }
}

type OwnerFields = {
  expenseId: string | null;
  incomeId: string | null;
  leadId: string | null;
  studentId: string | null;
  teacherProfileId: string | null;
  employeeId: string | null;
};

function ownerOf(document: OwnerFields): { key: OwnerKey; id: string } | null {
  if (document.expenseId) return { key: 'expense', id: document.expenseId };
  if (document.incomeId) return { key: 'income', id: document.incomeId };
  if (document.teacherProfileId) return { key: 'teacher', id: document.teacherProfileId };
  if (document.employeeId) return { key: 'employee', id: document.employeeId };
  if (document.leadId) return { key: 'lead', id: document.leadId };
  if (document.studentId) return { key: 'student', id: document.studentId };
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
    select: {
      id: true,
      storagePath: true,
      originalName: true,
      mimeType: true,
      size: true,
      category: true,
      title: true,
      expiresAt: true,
      expenseId: true,
      incomeId: true,
      leadId: true,
      studentId: true,
      teacherProfileId: true,
      employeeId: true,
    },
  });
  if (!document) {
    throw AppError.notFound('Hujjat topilmadi');
  }
  return document;
}

const dateOnly = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export const documentService = {
  async list(owner: DocumentOwner, entityId: string): Promise<DocumentDto[]> {
    await assertOwnerExists(owner, entityId);
    const documents = await prisma.document.findMany({
      where: { ...ownerWhere(owner, entityId), deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: documentSelect,
    });
    const items = documents.map(toDto);
    return OWNERS[owner].staff ? items.sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]) : items;
  },

  async upload(
    actor: AuthUser,
    owner: DocumentOwner,
    entityId: string,
    file: { buffer: unknown; fileName: string | undefined },
    meta: StaffDocumentMeta | null,
    client: ClientInfo,
  ): Promise<DocumentDto> {
    const config = OWNERS[owner];
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
    if ((await prisma.document.count({ where })) >= config.maxFiles) {
      throw AppError.unprocessable(`Bitta yozuvga eng ko‘pi ${config.maxFiles} ta fayl biriktiriladi`);
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    if (await prisma.document.findFirst({ where: { ...where, sha256 }, select: { id: true } })) {
      throw AppError.conflict('Bu fayl allaqachon biriktirilgan');
    }

    const category: DocumentCategory = config.staff ? (meta?.category ?? 'OTHER') : 'RECEIPT';
    const originalName = sanitizeFileName(file.fileName, type.ext);
    const storagePath = await saveFile(buffer, type.ext);
    try {
      const document = await prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            [config.field]: entityId,
            originalName,
            mimeType: type.mime,
            size: buffer.length,
            storagePath,
            sha256,
            category,
            title: config.staff ? (meta?.title ?? null) : null,
            expiresAt: config.staff ? (meta?.expiresAt ?? null) : null,
            uploadedById: actor.id,
          },
          select: documentSelect,
        });
        await auditService.recordInTransaction(tx, {
          userId: actor.id,
          action: 'document.uploaded',
          entityType: owner,
          entityId,
          metadata: { document: created.id, name: originalName, category, mimeType: type.mime, size: buffer.length },
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

  /** Xodim hujjatining turi, nomi yoki muddatini o‘zgartirish (fayl o‘zgarmaydi) */
  async update(actor: AuthUser, id: string, input: UpdateDocumentInput, client: ClientInfo): Promise<DocumentDto> {
    const document = await findActive(id);
    const owner = ownerOf(document);
    if (!owner || (owner.key !== 'teacher' && owner.key !== 'employee')) {
      throw AppError.unprocessable('Faqat o‘qituvchi va xodim hujjatlarining ma’lumotlari tahrirlanadi');
    }
    await assertPermission(actor, OWNER_PERMISSIONS[owner.key].manage);

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.document.update({
        where: { id },
        data: {
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
        },
        select: documentSelect,
      });
      await auditService.recordInTransaction(tx, {
        userId: actor.id,
        action: 'document.updated',
        entityType: owner.key,
        entityId: owner.id,
        metadata: {
          document: id,
          name: document.originalName,
          before: { category: document.category, title: document.title, expiresAt: dateOnly(document.expiresAt) },
          after: { category: record.category, title: record.title, expiresAt: dateOnly(record.expiresAt) },
        },
        ...client,
      });
      return record;
    });
    return toDto(updated);
  },

  /** Yuklab olish: bog‘langan yozuvni ko‘rish ruxsati bo‘lsa */
  async download(
    actor: AuthUser,
    id: string,
    client: ClientInfo,
  ): Promise<{ absolutePath: string; originalName: string; mimeType: string; size: number }> {
    const document = await findActive(id);
    const owner = ownerOf(document);
    if (!owner) {
      throw AppError.forbidden();
    }
    await assertPermission(actor, OWNER_PERMISSIONS[owner.key].view);
    // Pasport, shartnoma kabi xodim hujjatini kim ochgani tarixda qolsin
    if (owner.key === 'teacher' || owner.key === 'employee') {
      await auditService.record({
        userId: actor.id,
        action: 'document.downloaded',
        entityType: owner.key,
        entityId: owner.id,
        metadata: { document: id, name: document.originalName, category: document.category },
        ...client,
      });
    }
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
