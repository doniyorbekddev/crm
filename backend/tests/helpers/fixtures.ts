import { prisma } from '../../src/config/database.js';
import type { LeadStatus, WeekDay } from '../../src/generated/prisma/client.js';

let counter = 0;

function next(): number {
  counter += 1;
  return counter;
}

export async function createSource(name = 'Instagram') {
  const index = next();
  return prisma.source.create({ data: { key: `SOURCE_${index}`, name, sortOrder: index } });
}

export async function createCourse(name?: string) {
  const index = next();
  return prisma.course.create({
    data: { name: name ?? `Kurs ${index}`, durationMonths: 6, price: 1_000_000, finalPrice: 1_000_000 },
  });
}

export interface TestGroupOptions {
  courseId: string;
  name?: string;
  teacherId?: string | null;
  capacity?: number;
  scheduleDays?: WeekDay[];
  startDate?: string;
}

export async function createGroup(options: TestGroupOptions) {
  const index = next();
  return prisma.group.create({
    data: {
      name: options.name ?? `Guruh ${index}`,
      courseId: options.courseId,
      teacherId: options.teacherId ?? null,
      capacity: options.capacity ?? 12,
      scheduleDays: options.scheduleDays ?? ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
      startTime: '14:00',
      endTime: '16:00',
      startDate: new Date(options.startDate ?? '2026-09-01'),
      status: 'ACTIVE',
    },
  });
}

export interface TestLeadOptions {
  sourceId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: LeadStatus;
  assignedToId?: string | null;
  courseId?: string;
}

export async function createLead(options: TestLeadOptions) {
  const index = next();
  return prisma.lead.create({
    data: {
      firstName: options.firstName ?? `Mijoz${index}`,
      lastName: options.lastName ?? null,
      phone: options.phone ?? `+99890${String(index).padStart(7, '0')}`,
      status: options.status ?? 'NEW',
      sourceId: options.sourceId,
      courseId: options.courseId ?? null,
      assignedToId: options.assignedToId ?? null,
    },
  });
}
