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
  PortalChildSummary,
  WeeklyReport,
  AttemptView,
  AvailableExam,
} from '@/types/portal';
import { downloadFile } from '@/lib/download';
import type { ProgressHistoryPoint, StudentMastery } from '@/types/mastery';
import type { SearchResult } from '@/types/search';
import type { LessonMaterial, LessonTree, PortalLessonDetail } from '@/types/lesson';
import type { HomeworkAttachment, SubmissionFile } from '@/types/homework';
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

  /** Ota-ona: har farzand bo‘yicha qisqa ko‘rsatkichlar */
  async children(): Promise<PortalChildSummary[]> {
    const response = await api.get<ApiSuccessResponse<PortalChildSummary[]>>('/portal/children');
    return response.data.data;
  },

  /** Kurs dasturi: nashr qilingan darslar va o‘quvchi tugatganlari */
  async course(studentId?: string): Promise<LessonTree> {
    const response = await api.get<ApiSuccessResponse<LessonTree>>('/portal/course', { params: { studentId } });
    return response.data.data;
  },

  async lesson(lessonId: string, studentId?: string): Promise<PortalLessonDetail> {
    const response = await api.get<ApiSuccessResponse<PortalLessonDetail>>(`/portal/course/lessons/${lessonId}`, { params: { studentId } });
    return response.data.data;
  },

  /** "Darsni o‘rgandim" — faqat o‘quvchining o‘zi */
  async completeLesson(lessonId: string, completed: boolean): Promise<MessageResult<{ completed: boolean }>> {
    const response = await api.post<ApiSuccessResponse<{ completed: boolean }>>(`/portal/course/lessons/${lessonId}/complete`, { completed });
    return { data: response.data.data, message: response.data.message };
  },

  downloadLessonMaterial(material: LessonMaterial, studentId?: string): Promise<void> {
    return downloadFile(`/portal/course/materials/${material.id}/download`, { studentId }, material.originalName ?? material.title);
  },

  /** Haftalik hisobot; `week` — hafta ichidagi sana (bo‘lmasa joriy hafta) */
  async weeklyReport(studentId?: string, week?: string): Promise<WeeklyReport> {
    const response = await api.get<ApiSuccessResponse<WeeklyReport>>('/portal/weekly-report', { params: { studentId, week } });
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

  /** Kabinet qidiruvi: vazifa, imtihon, dars, sertifikat (ota-onaga — farzandlar) */
  async search(query: string, studentId?: string): Promise<SearchResult> {
    const response = await api.get<ApiSuccessResponse<SearchResult>>('/portal/search', { params: { q: query, studentId } });
    return response.data.data;
  },

  /** Mavzular bo'yicha o'zlashtirish va oylik tarix */
  async mastery(studentId?: string): Promise<StudentMastery & { history: ProgressHistoryPoint[] }> {
    const response = await api.get<ApiSuccessResponse<StudentMastery & { history: ProgressHistoryPoint[] }>>('/portal/mastery', { params: { studentId } });
    return response.data.data;
  },

  /** Onlayn topshiriladigan imtihonlar */
  async availableExams(studentId?: string): Promise<AvailableExam[]> {
    const response = await api.get<ApiSuccessResponse<AvailableExam[]>>('/portal/exams/available', { params: { studentId } });
    return response.data.data;
  },

  /** Boshlash yoki ochiq urinishni davom ettirish */
  async startExam(examId: string): Promise<AttemptView> {
    const response = await api.post<ApiSuccessResponse<AttemptView>>(`/portal/exams/${examId}/start`);
    return response.data.data;
  },

  async attempt(attemptId: string, studentId?: string): Promise<AttemptView> {
    const response = await api.get<ApiSuccessResponse<AttemptView>>(`/portal/attempts/${attemptId}`, { params: { studentId } });
    return response.data.data;
  },

  /** Avtosaqlash — topshirmaydi */
  async saveExamAnswer(attemptId: string, questionId: string, payload: { optionIds?: string[]; text?: string | null }): Promise<void> {
    await api.put(`/portal/attempts/${attemptId}/answers/${questionId}`, payload);
  },

  async uploadExamAnswerFile(attemptId: string, questionId: string, file: File): Promise<void> {
    await api.post(`/portal/attempts/${attemptId}/answers/${questionId}/file`, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
  },

  async submitExam(attemptId: string): Promise<MessageResult<AttemptView>> {
    const response = await api.post<ApiSuccessResponse<AttemptView>>(`/portal/attempts/${attemptId}/submit`);
    return { data: response.data.data, message: response.data.message };
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

  /** Qoralama saqlash — topshirilmaydi (holat "Bajarilmoqda") */
  async saveHomeworkDraft(homeworkId: string, payload: HomeworkSubmitPayload, studentId?: string): Promise<MessageResult<{ status: string }>> {
    const response = await api.put<ApiSuccessResponse<{ status: string }>>(`/portal/homework/${homeworkId}/draft`, payload, { params: { studentId } });
    return { data: response.data.data, message: response.data.message };
  },

  /** Fayl qo‘shish (topshirmasdan) — ko‘pi bilan 5 ta */
  async addHomeworkFile(homeworkId: string, file: File, studentId?: string): Promise<MessageResult<SubmissionFile>> {
    const response = await api.post<ApiSuccessResponse<SubmissionFile>>(`/portal/homework/${homeworkId}/files`, file, {
      params: { studentId },
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    });
    return { data: response.data.data, message: response.data.message };
  },

  async removeHomeworkFile(homeworkId: string, fileId: string, studentId?: string): Promise<string> {
    const response = await api.delete<ApiSuccessResponse<null>>(`/portal/homework/${homeworkId}/files/${fileId}`, { params: { studentId } });
    return response.data.message;
  },

  downloadHomeworkFile(homeworkId: string, file: SubmissionFile, studentId?: string): Promise<void> {
    return downloadFile(`/portal/homework/${homeworkId}/files/${file.id}`, { studentId }, file.originalName);
  },

  /** O‘qituvchi biriktirgan fayl */
  downloadHomeworkMaterial(homeworkId: string, attachment: HomeworkAttachment, studentId?: string): Promise<void> {
    return downloadFile(`/portal/homework/${homeworkId}/materials/${attachment.id}`, { studentId }, attachment.originalName ?? attachment.title);
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
