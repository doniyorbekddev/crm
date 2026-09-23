export interface Certificate {
  id: string;
  /** CRT-2026-000123 */
  code: string;
  verifyToken: string;
  studentId: string;
  studentName: string;
  courseName: string;
  teacherName: string | null;
  branchName: string | null;
  startDate: string;
  completionDate: string;
  percentage: number | null;
  grade: string | null;
  note: string | null;
  issuedAt: string;
  issuedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

/** Ochiq tekshiruv javobi — minimal ma'lumot */
export interface CertificateVerification {
  valid: boolean;
  code: string;
  studentName: string;
  courseName: string;
  teacherName: string | null;
  completionDate: string;
  grade: string | null;
  issuedAt: string;
  revokedAt: string | null;
}
