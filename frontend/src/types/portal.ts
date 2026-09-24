import type { StudentProfile } from './studentProfile';
import type { PaymentSchedule } from './paymentSchedule';

export interface PortalChild {
  studentId: string;
  firstName: string;
  lastName: string;
  /** "ST-000045" */
  code: string;
  groupName: string | null;
  courseName: string;
}

export interface PortalMe {
  kind: 'STUDENT' | 'PARENT';
  fullName: string;
  /** Ota-ona uchun farzandlar; o‘quvchi uchun bitta yozuv */
  children: PortalChild[];
}

export type PortalProfile = StudentProfile;
export type PortalSchedule = PaymentSchedule;

export interface PortalAccount {
  userId: string;
  email: string;
  /** Vaqtinchalik parol — faqat yaratish javobida ko‘rinadi */
  temporaryPassword: string;
}

export interface PortalLesson {
  date: string;
  startTime: string;
  endTime: string;
  room: string | null;
  status: 'PLANNED' | 'HELD' | 'CANCELLED';
  topic?: string | null;
}

export interface PortalLessons {
  group: { id: string; name: string; course: string } | null;
  /** O‘qituvchi haqida faqat ism va yo‘nalish — aloqa ma’lumotlari ko‘rsatilmaydi */
  teacher: { name: string; specialization: string | null } | null;
  lessons: PortalLesson[];
}
