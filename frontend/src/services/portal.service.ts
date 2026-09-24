import { api } from '@/lib/api';
import type { ApiSuccessResponse } from '@/types/api';
import type { MessageResult } from '@/services/auth.service';
import type {
  HomeworkSubmitPayload,
  PortalExamDetail,
  PortalHomeworkDetail,
  PortalLessons,
  PortalMe,
  PortalOverview,
  PortalPayments,
  PortalProfile,
  PortalSchedule,
} from '@/types/portal';
import { downloadFile } from '@/lib/download';
import type { StudentCurriculumProgress } from '@/types/curriculum';
import type { Certificate } from '@/types/certificate';
import type { StudentExamRow, StudentHomeworkRow } from '@/types/studentProfile';
import type { AttendanceCalendar } from '@/types/attendanceAnalytics';
import type { GamificationProfile } from '@/types/gamification';

/**
 * Kabinet API'si. Hech qanday `studentId` ga ishonilmaydi — backend har so‘rovda
 * foydalanuvchi bilan o‘quvchi bog‘lanishini qayta tekshiradi.
 */
export const portalService = {
  async me(): Promise<PortalMe> {
    const response = await api.get<ApiSuccessResponse<PortalMe>>('/portal/me');
    return response.data.data;
  },

  async profile(studentId?: string): Promise<PortalProfile> {
    const response = await api.get<ApiSuccessResponse<PortalProfile>>('/portal/profile', { params: { studentId } });
    return response.data.data;
  },

  async schedule(studentId?: string): Promise<PortalSchedule> {
    const response = await api.get<ApiSuccessResponse<PortalSchedule>>('/portal/schedule', { params: { studentId } });
    return response.data.data;
  },

  /** Kelgusi darslar va o‘qituvchi */
  async lessons(studentId?: string): Promise<PortalLessons> {
    const response = await api.get<ApiSuccessResponse<PortalLessons>>('/portal/lessons', { params: { studentId } });
    return response.data.data;
  },

  /** Kurs dasturi bo‘yicha progress */
  async curriculum(studentId?: string): Promise<StudentCurriculumProgress | null> {
    const response = await api.get<ApiSuccessResponse<StudentCurriculumProgress | null>>('/portal/curriculum', {
      params: { studentId },
    });
    return response.data.data;
  },

  async certificates(studentId?: string): Promise<Certificate[]> {
    const response = await api.get<ApiSuccessResponse<Certificate[]>>('/portal/certificates', { params: { studentId } });
    return response.data.data;
  },

  /** Bosh sahifa qo‘shimcha ko‘rsatkichlari (risk, keyingi dars/imtihon, kutilayotgan vazifa) */
  async overview(studentId?: string): Promise<PortalOverview> {
    const response = await api.get<ApiSuccessResponse<PortalOverview>>('/portal/overview', { params: { studentId } });
    return response.data.data;
  },

  async homeworkDetail(homeworkId: string, studentId?: string): Promise<PortalHomeworkDetail> {
    const response = await api.get<ApiSuccessResponse<PortalHomeworkDetail>>(`/portal/homework/${homeworkId}`, { params: { studentId } });
    return response.data.data;
  },

  /** O‘zi yuklagan faylni yuklab olish */
  downloadHomeworkAttachment(homeworkId: string, fallbackName: string, studentId?: string): Promise<void> {
    return downloadFile(`/portal/homework/${homeworkId}/attachment`, { studentId }, fallbackName);
  },

  async examDetail(examId: string, studentId?: string): Promise<PortalExamDetail> {
    const response = await api.get<ApiSuccessResponse<PortalExamDetail>>(`/portal/exams/${examId}`, { params: { studentId } });
    return response.data.data;
  },

  /** Uy vazifalari — topshiriq holati, ball, izoh bilan */
  async homework(studentId?: string): Promise<StudentHomeworkRow[]> {
    const response = await api.get<ApiSuccessResponse<StudentHomeworkRow[]>>('/portal/homework', { params: { studentId } });
    return response.data.data;
  },

  /** Matnli javob bilan topshirish */
  async submitHomework(homeworkId: string, payload: HomeworkSubmitPayload, studentId?: string): Promise<MessageResult<unknown>> {
    const response = await api.post<ApiSuccessResponse<unknown>>(`/portal/homework/${homeworkId}/submit`, payload, {
      params: { studentId },
    });
    return { data: response.data.data, message: response.data.message };
  },

  /** Fayl bilan topshirish — hujjatlar bilan bir xil: tana faylning o‘zi, nomi sarlavhada */
  async submitHomeworkAttachment(homeworkId: string, file: File, studentId?: string): Promise<MessageResult<unknown>> {
    const response = await api.post<ApiSuccessResponse<unknown>>(`/portal/homework/${homeworkId}/attachment`, file, {
      params: { studentId },
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return { data: response.data.data, message: response.data.message };
  },

  /** Imtihon natijalari */
  async exams(studentId?: string): Promise<StudentExamRow[]> {
    const response = await api.get<ApiSuccessResponse<StudentExamRow[]>>('/portal/exams', { params: { studentId } });
    return response.data.data;
  },

  /** Oylik davomat kalendari */
  async attendanceCalendar(year: number, month: number, studentId?: string): Promise<AttendanceCalendar> {
    const response = await api.get<ApiSuccessResponse<AttendanceCalendar>>('/portal/attendance/calendar', {
      params: { studentId, year, month },
    });
    return response.data.data;
  },

  /** XP, daraja, seriya, reyting, nishonlar */
  async gamification(studentId?: string): Promise<GamificationProfile> {
    const response = await api.get<ApiSuccessResponse<GamificationProfile>>('/portal/gamification', { params: { studentId } });
    return response.data.data;
  },

  /** To‘lov jadvali va so‘nggi to‘lovlar */
  async payments(studentId?: string): Promise<PortalPayments> {
    const response = await api.get<ApiSuccessResponse<PortalPayments>>('/portal/payments', { params: { studentId } });
    return response.data.data;
  },
};
