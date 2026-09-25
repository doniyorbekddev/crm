import { prisma } from '../config/database.js';
import { formatLeadNumber } from '../config/leadLabels.js';
import { formatPaymentNumber } from '../config/paymentLabels.js';
import { PERMISSIONS } from '../config/permissions.js';
import { STUDENT_STATUS_LABELS, formatStudentNumber } from '../config/studentLabels.js';
import { certificateCode } from './certificate.service.js';
import type { Prisma, TransactionType } from '../generated/prisma/client.js';
import type { AuthUser } from '../types/auth.js';
import { permissionService } from './permission.service.js';
import { moneyUz } from '../utils/money.js';

/** Har bir bo‘limdan ko‘rsatiladigan natijalar soni */
const PER_GROUP = 5;

export type SearchGroupKey =
  | 'leads'
  | 'students'
  | 'parents'
  | 'teachers'
  | 'courses'
  | 'groups'
  | 'users'
  | 'payments'
  | 'transactions'
  | 'certificates'
  | 'homework'
  | 'exams'
  | 'lessons'
  | 'children';

export interface SearchHit {
  id: string;
  title: string;
  /** Qo‘shimcha qator: telefon, kurs, holat va h.k. */
  subtitle: string;
  /** Ko‘rinadigan kod: L-000123, ST-000045, PM-000007 */
  code: string | null;
  /** Frontend shu manzilga o‘tadi */
  url: string;
}

export interface SearchGroupDto {
  key: SearchGroupKey;
  label: string;
  hits: SearchHit[];
}

export interface SearchResultDto {
  query: string;
  total: number;
  groups: SearchGroupDto[];
}

const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: 'Kirim',
  EXPENSE: 'Chiqim',
  TRANSFER: 'O‘tkazma',
  REFUND: 'Qaytarish',
};

/** "TX-12", "#12", "№12" yoki "12" — tranzaksiya raqami */
function transactionNumberFrom(term: string): number | null {
  const match = /^(?:tx[-\s]?|#|№\s?)?0*(\d{1,9})$/i.exec(term.trim());
  return match?.[1] ? Number(match[1]) : null;
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

/** "L-000123", "st 45", "PM7" kabi yozuvlardan raqamni ajratadi */
function numberFrom(term: string, prefix: 'l' | 'st' | 'pm'): number | null {
  const match = new RegExp(`^(?:${prefix}[-\\s]?)?0*(\\d{1,9})$`, 'i').exec(term.trim());
  return match?.[1] ? Number(match[1]) : null;
}

export const searchService = {
  /**
   * Global qidiruv: har bir bo‘lim xodimning ruxsatiga qarab qo‘shiladi.
   * So‘rovlar ketma-ket bajariladi — lokal dev bazasi ko‘p parallel so‘rovni ko‘tarmaydi.
   */
  async search(actor: AuthUser, rawQuery: string): Promise<SearchResultDto> {
    const query = rawQuery.trim();
    const permissions = await permissionService.getRolePermissions(actor.roleId);
    const groups: SearchGroupDto[] = [];

    if (query.length < 2) {
      return { query, total: 0, groups };
    }

    // "L-000012", "ST-000006", "PM-000008", "TX-12" — bu kodlar telefon raqami sifatida qidirilmaydi
    const isPrefixedCode = /^(?:l|st|pm|tx)[-\s]?\d+$|^[#№]\s?\d+$/i.test(query);
    const digits = isPrefixedCode ? '' : digitsOf(query);
    const phoneCondition = digits.length >= 3 ? [{ phone: { contains: digits } }] : [];

    // --- Leadlar ---
    if (permissions.has(PERMISSIONS.LEAD_VIEW)) {
      const canViewAll = permissions.has(PERMISSIONS.LEAD_VIEW_ALL);
      const leadNumber = numberFrom(query, 'l');
      const or: Prisma.LeadWhereInput[] = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { telegram: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        ...phoneCondition,
      ];
      if (leadNumber !== null) or.push({ number: leadNumber });

      const leads = await prisma.lead.findMany({
        where: {
          deletedAt: null,
          ...(canViewAll ? {} : { OR: [{ assignedToId: actor.id }, { assignedToId: null }] }),
          AND: [{ OR: or }],
        },
        select: {
          id: true,
          number: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          course: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PER_GROUP,
      });

      if (leads.length > 0) {
        groups.push({
          key: 'leads',
          label: 'Leadlar',
          hits: leads.map((lead) => ({
            id: lead.id,
            title: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
            subtitle: [lead.phone, lead.course?.name].filter(Boolean).join(' · '),
            code: formatLeadNumber(lead.number),
            url: `/leads/${lead.id}`,
          })),
        });
      }
    }

    // --- O‘quvchilar ---
    if (permissions.has(PERMISSIONS.STUDENT_VIEW)) {
      const onlyOwnGroups = !permissions.has(PERMISSIONS.STUDENT_MANAGE) && permissions.has(PERMISSIONS.ATTENDANCE_MARK);
      const studentNumber = numberFrom(query, 'st');
      const or: Prisma.StudentWhereInput[] = [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { contractNumber: { contains: query, mode: 'insensitive' } },
        ...phoneCondition,
        ...(digits.length >= 3 ? [{ parentPhone: { contains: digits } }] : []),
      ];
      if (studentNumber !== null) or.push({ number: studentNumber });

      const students = await prisma.student.findMany({
        where: {
          deletedAt: null,
          ...(onlyOwnGroups ? { group: { teacherId: actor.id } } : {}),
          AND: [{ OR: or }],
        },
        select: {
          id: true,
          number: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          course: { select: { name: true } },
          group: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: PER_GROUP,
      });

      if (students.length > 0) {
        groups.push({
          key: 'students',
          label: 'O‘quvchilar',
          hits: students.map((student) => ({
            id: student.id,
            title: `${student.firstName} ${student.lastName}`,
            subtitle: [student.phone, student.course.name, student.group?.name, STUDENT_STATUS_LABELS[student.status]]
              .filter(Boolean)
              .join(' · '),
            code: formatStudentNumber(student.number),
            url: `/students/${student.id}`,
          })),
        });
      }
    }

    // --- Ota-onalar ---
    if (permissions.has(PERMISSIONS.PARENT_VIEW)) {
      const onlyOwnGroups = !permissions.has(PERMISSIONS.STUDENT_MANAGE) && permissions.has(PERMISSIONS.ATTENDANCE_MARK);
      const childFilter: Prisma.StudentParentWhereInput = {
        student: { deletedAt: null, ...(onlyOwnGroups ? { group: { teacherId: actor.id } } : {}) },
      };
      const parents = await prisma.parent.findMany({
        where: {
          ...(onlyOwnGroups ? { students: { some: childFilter } } : {}),
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { telegram: { contains: query, mode: 'insensitive' } },
            ...phoneCondition,
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          students: { where: childFilter, select: { student: { select: { firstName: true } } }, take: 3 },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: PER_GROUP,
      });

      if (parents.length > 0) {
        groups.push({
          key: 'parents',
          label: 'Ota-onalar',
          hits: parents.map((parent) => ({
            id: parent.id,
            title: `${parent.firstName} ${parent.lastName}`,
            subtitle: [parent.phone, parent.students.length ? `farzandi: ${parent.students.map((link) => link.student.firstName).join(', ')}` : null]
              .filter(Boolean)
              .join(' · '),
            code: null,
            url: '/parents',
          })),
        });
      }
    }

    // --- O‘qituvchilar ---
    if (permissions.has(PERMISSIONS.TEACHER_VIEW)) {
      const teachers = await prisma.teacherProfile.findMany({
        where: {
          user: { deletedAt: null },
          OR: [
            { specialization: { contains: query, mode: 'insensitive' } },
            { user: { firstName: { contains: query, mode: 'insensitive' } } },
            { user: { lastName: { contains: query, mode: 'insensitive' } } },
            { user: { email: { contains: query, mode: 'insensitive' } } },
            ...(digits.length >= 3 ? [{ user: { phone: { contains: digits } } }] : []),
          ],
        },
        select: { id: true, specialization: true, isActive: true, user: { select: { firstName: true, lastName: true, phone: true } } },
        orderBy: [{ isActive: 'desc' }, { user: { firstName: 'asc' } }],
        take: PER_GROUP,
      });

      if (teachers.length > 0) {
        groups.push({
          key: 'teachers',
          label: 'O‘qituvchilar',
          hits: teachers.map((teacher) => ({
            id: teacher.id,
            title: `${teacher.user.firstName} ${teacher.user.lastName}`,
            subtitle: [teacher.specialization, teacher.user.phone, teacher.isActive ? null : 'faolsiz'].filter(Boolean).join(' · '),
            code: null,
            url: '/teachers',
          })),
        });
      }
    }

    // --- Kurslar ---
    if (permissions.has(PERMISSIONS.COURSE_VIEW)) {
      const courses = await prisma.course.findMany({
        where: { name: { contains: query, mode: 'insensitive' } },
        select: { id: true, name: true, finalPrice: true, _count: { select: { students: { where: { deletedAt: null } } } } },
        orderBy: { name: 'asc' },
        take: PER_GROUP,
      });

      if (courses.length > 0) {
        groups.push({
          key: 'courses',
          label: 'Kurslar',
          hits: courses.map((course) => ({
            id: course.id,
            title: course.name,
            subtitle: `${moneyUz(course.finalPrice.toNumber())} · ${course._count.students} o‘quvchi`,
            code: null,
            url: '/courses',
          })),
        });
      }
    }

    // --- Guruhlar ---
    if (permissions.has(PERMISSIONS.GROUP_VIEW)) {
      const groupRows = await prisma.group.findMany({
        where: {
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { room: { contains: query, mode: 'insensitive' } }],
        },
        select: {
          id: true,
          name: true,
          room: true,
          course: { select: { name: true } },
          teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: { name: 'asc' },
        take: PER_GROUP,
      });

      if (groupRows.length > 0) {
        groups.push({
          key: 'groups',
          label: 'Guruhlar',
          hits: groupRows.map((group) => ({
            id: group.id,
            title: group.name,
            subtitle: [group.course.name, group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : null, group.room ? `${group.room}-xona` : null]
              .filter(Boolean)
              .join(' · '),
            code: null,
            url: '/groups',
          })),
        });
      }
    }

    // --- To‘lovlar (kvitansiya raqami bo‘yicha) ---
    if (permissions.has(PERMISSIONS.PAYMENT_VIEW)) {
      const paymentNumber = numberFrom(query, 'pm');
      if (paymentNumber !== null) {
        const payments = await prisma.payment.findMany({
          where: { number: paymentNumber },
          select: {
            id: true,
            number: true,
            amount: true,
            paidAt: true,
            deletedAt: true,
            student: { select: { firstName: true, lastName: true } },
          },
          take: PER_GROUP,
        });

        if (payments.length > 0) {
          groups.push({
            key: 'payments',
            label: 'To‘lovlar',
            hits: payments.map((payment) => ({
              id: payment.id,
              title: `${payment.student.firstName} ${payment.student.lastName}`,
              subtitle: `${moneyUz(payment.amount.toNumber())} · ${payment.paidAt.toISOString().slice(0, 10)}${payment.deletedAt ? ' · bekor qilingan' : ''}`,
              code: formatPaymentNumber(payment.number),
              url: '/payments',
            })),
          });
        }
      }
    }

    // --- Tranzaksiyalar (moliyaviy daftar): raqam, izoh yoki kategoriya bo‘yicha ---
    if (permissions.has(PERMISSIONS.FINANCE_VIEW)) {
      const or: Prisma.TransactionWhereInput[] = [];
      const transactionNumber = transactionNumberFrom(query);
      if (transactionNumber !== null) or.push({ number: transactionNumber });
      if (!isPrefixedCode && query.length >= 3) {
        or.push({ description: { contains: query, mode: 'insensitive' } }, { categoryName: { contains: query, mode: 'insensitive' } });
      }

      if (or.length > 0) {
        const transactions = await prisma.transaction.findMany({
          where: { OR: or },
          select: {
            id: true,
            number: true,
            type: true,
            status: true,
            amount: true,
            occurredAt: true,
            description: true,
            categoryName: true,
            account: { select: { name: true } },
          },
          orderBy: { occurredAt: 'desc' },
          take: PER_GROUP,
        });

        if (transactions.length > 0) {
          groups.push({
            key: 'transactions',
            label: 'Tranzaksiyalar',
            hits: transactions.map((transaction) => ({
              id: transaction.id,
              title: `${TRANSACTION_TYPE_LABELS[transaction.type]} · ${moneyUz(transaction.amount.toNumber())}`,
              subtitle: [
                transaction.occurredAt.toISOString().slice(0, 10),
                transaction.categoryName ?? transaction.description,
                transaction.account?.name,
                transaction.status === 'COMPLETED' ? null : 'bekor qilingan',
              ]
                .filter(Boolean)
                .join(' · '),
              code: `№${transaction.number}`,
              url: '/finance',
            })),
          });
        }
      }
    }

    // --- Xodimlar ---
    if (permissions.has(PERMISSIONS.USER_VIEW)) {
      const users = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        },
        select: { id: true, firstName: true, lastName: true, email: true, role: { select: { name: true } } },
        orderBy: { firstName: 'asc' },
        take: PER_GROUP,
      });

      if (users.length > 0) {
        groups.push({
          key: 'users',
          label: 'Xodimlar',
          hits: users.map((user) => ({
            id: user.id,
            title: `${user.firstName} ${user.lastName}`,
            subtitle: `${user.role.name} · ${user.email}`,
            code: null,
            url: '/users',
          })),
        });
      }
    }

    // --- Sertifikatlar ---
    // Raqam (CRT-2026-000001) yoki o'quvchi ismi bo'yicha. Tekshiruv kaliti (`verifyToken`)
    // qidiruvda ishlatilmaydi — u faqat ochiq tekshiruv sahifasi uchun.
    if (permissions.has(PERMISSIONS.STUDENT_VIEW)) {
      const numeric = Number(query.replace(/^crt[-\s]*\d{4}[-\s]*/i, '').replace(/\D/g, ''));
      const certificateNumber = Number.isInteger(numeric) && numeric > 0 && numeric < 2_000_000_000 ? numeric : null;
      const certificates = await prisma.certificate.findMany({
        where: {
          OR: [
            { studentName: { contains: query, mode: 'insensitive' } },
            { courseName: { contains: query, mode: 'insensitive' } },
            // "CRT-2026-000007" yoki shunchaki "7" — raqam qismi ajratib olinadi
            ...(certificateNumber === null ? [] : [{ number: certificateNumber }]),
          ],
        },
        select: { id: true, number: true, studentName: true, courseName: true, issuedAt: true, revokedAt: true, studentId: true },
        orderBy: { issuedAt: 'desc' },
        take: PER_GROUP,
      });

      if (certificates.length > 0) {
        groups.push({
          key: 'certificates',
          label: 'Sertifikatlar',
          hits: certificates.map((certificate) => ({
            id: certificate.id,
            title: certificate.studentName,
            subtitle: `${certificate.courseName}${certificate.revokedAt ? ' · bekor qilingan' : ''}`,
            code: certificateCode(certificate.number, certificate.issuedAt),
            url: `/students/${certificate.studentId}`,
          })),
        });
      }
    }

    // --- Uy vazifalari va imtihonlar (TZ 3.0 §45: o'qituvchi — o'z guruhlari) ---
    const teacherScope = permissions.has(PERMISSIONS.GROUP_MANAGE) ? {} : { group: { teacherId: actor.id } };
    if (permissions.has(PERMISSIONS.HOMEWORK_VIEW)) {
      const rows = await prisma.homework.findMany({
        where: { title: { contains: query, mode: 'insensitive' }, ...teacherScope },
        select: { id: true, title: true, deadline: true, status: true, group: { select: { name: true } } },
        orderBy: { deadline: 'desc' },
        take: PER_GROUP,
      });
      if (rows.length > 0) {
        groups.push({
          key: 'homework',
          label: 'Uy vazifalari',
          hits: rows.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: `${row.group.name} · muddat ${row.deadline.toISOString().slice(0, 10)}${row.status === 'DRAFT' ? ' · qoralama' : ''}`,
            code: null,
            url: '/homework',
          })),
        });
      }
    }
    if (permissions.has(PERMISSIONS.EXAM_VIEW)) {
      const rows = await prisma.exam.findMany({
        where: { title: { contains: query, mode: 'insensitive' }, ...teacherScope },
        select: { id: true, title: true, date: true, isOnline: true, group: { select: { name: true } } },
        orderBy: { date: 'desc' },
        take: PER_GROUP,
      });
      if (rows.length > 0) {
        groups.push({
          key: 'exams',
          label: 'Imtihonlar',
          hits: rows.map((row) => ({
            id: row.id,
            title: row.title,
            subtitle: `${row.group.name} · ${row.date.toISOString().slice(0, 10)}${row.isOnline ? ' · onlayn' : ''}`,
            code: null,
            url: '/exams',
          })),
        });
      }
    }

    return { query, total: groups.reduce((sum, group) => sum + group.hits.length, 0), groups };
  },

  /**
   * Kabinet qidiruvi (TZ 3.0 §45 "Portal"): faqat o'quvchining **o'z** vazifalari, imtihonlari,
   * nashr qilingan darslari va sertifikatlari; ota-onaga — farzandlari ham. Egalik chaqiruvchida
   * (`portal.service` — `studentIds` doirasi). Havolalar kabinet sahifalariga.
   */
  async portal(rawQuery: string, input: { studentIds: string[]; activeStudentId: string; includeChildren: boolean }): Promise<SearchResultDto> {
    const query = rawQuery.trim();
    const groups: SearchGroupDto[] = [];
    if (query.length < 2) return { query, total: 0, groups };
    const contains = { contains: query, mode: 'insensitive' as const };
    const student = await prisma.student.findFirst({ where: { id: input.activeStudentId, deletedAt: null }, select: { groupId: true, courseId: true } });
    if (!student) return { query, total: 0, groups };

    const [children, homework, exams, lessons, certificates] = await Promise.all([
      input.includeChildren
        ? prisma.student.findMany({
            where: { id: { in: input.studentIds }, deletedAt: null, OR: [{ firstName: contains }, { lastName: contains }] },
            select: { id: true, firstName: true, lastName: true, group: { select: { name: true } } },
            take: PER_GROUP,
          })
        : Promise.resolve([]),
      prisma.homeworkSubmission.findMany({
        where: { studentId: input.activeStudentId, homework: { title: contains, status: { not: 'DRAFT' } } },
        select: { homework: { select: { id: true, title: true, deadline: true } }, status: true },
        orderBy: { homework: { deadline: 'desc' } },
        take: PER_GROUP,
      }),
      prisma.exam.findMany({
        where: {
          title: contains,
          status: { not: 'CANCELLED' },
          OR: [...(student.groupId ? [{ groupId: student.groupId }] : []), { results: { some: { studentId: input.activeStudentId } } }],
        },
        select: { id: true, title: true, date: true, isOnline: true },
        orderBy: { date: 'desc' },
        take: PER_GROUP,
      }),
      prisma.lesson.findMany({
        where: { status: 'PUBLISHED', title: contains, topic: { module: { courseId: student.courseId } } },
        select: { id: true, title: true, topic: { select: { title: true } } },
        take: PER_GROUP,
      }),
      prisma.certificate.findMany({
        where: { studentId: input.activeStudentId, revokedAt: null, OR: [{ courseName: contains }, { studentName: contains }] },
        select: { id: true, number: true, courseName: true, issuedAt: true },
        take: PER_GROUP,
      }),
    ]);

    if (children.length) {
      groups.push({ key: 'children', label: 'Farzandlar', hits: children.map((row) => ({ id: row.id, title: `${row.firstName} ${row.lastName}`, subtitle: row.group?.name ?? '', code: null, url: '/portal' })) });
    }
    if (homework.length) {
      groups.push({
        key: 'homework',
        label: 'Uy vazifalari',
        hits: homework.map((row) => ({ id: row.homework.id, title: row.homework.title, subtitle: `muddat ${row.homework.deadline.toISOString().slice(0, 10)}`, code: null, url: `/portal/homework/${row.homework.id}` })),
      });
    }
    if (exams.length) {
      groups.push({ key: 'exams', label: 'Imtihonlar', hits: exams.map((row) => ({ id: row.id, title: row.title, subtitle: `${row.date.toISOString().slice(0, 10)}${row.isOnline ? ' · onlayn' : ''}`, code: null, url: `/portal/exams/${row.id}` })) });
    }
    if (lessons.length) {
      groups.push({ key: 'lessons', label: 'Darslar', hits: lessons.map((row) => ({ id: row.id, title: row.title, subtitle: row.topic.title, code: null, url: `/portal/course/lessons/${row.id}` })) });
    }
    if (certificates.length) {
      groups.push({
        key: 'certificates',
        label: 'Sertifikatlar',
        hits: certificates.map((row) => ({ id: row.id, title: row.courseName, subtitle: row.issuedAt.toISOString().slice(0, 10), code: certificateCode(row.number, row.issuedAt), url: '/portal' })),
      });
    }
    return { query, total: groups.reduce((sum, group) => sum + group.hits.length, 0), groups };
  },
};
