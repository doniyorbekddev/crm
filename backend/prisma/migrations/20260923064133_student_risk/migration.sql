-- =====================================================================
-- O'quvchi risk tizimi va holat tarixi — PHASE 2
--
--   1. RiskLevel enum (HEALTHY / ATTENTION / AT_RISK / CRITICAL);
--   2. StudentStatus ga ALUMNI qiymati (mavjud qiymatlar tegilmaydi);
--   3. students: healthScore, riskLevel, riskFactors, riskUpdatedAt —
--      hammasi NULL bo'lishi mumkin, hisoblovchi job to'ldiradi;
--   4. student_status_changes — holat tarixi (kim, qachon, sabab).
--
-- Risk — holat (status) emas, alohida o'lchov: o'quvchi bir vaqtda
-- ACTIVE va CRITICAL bo'lishi mumkin. Mavjud status mantig'i o'zgarmaydi.
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('HEALTHY', 'ATTENTION', 'AT_RISK', 'CRITICAL');

-- AlterEnum
ALTER TYPE "StudentStatus" ADD VALUE 'ALUMNI';

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "healthScore" SMALLINT,
ADD COLUMN     "riskFactors" JSONB,
ADD COLUMN     "riskLevel" "RiskLevel",
ADD COLUMN     "riskUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "student_status_changes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromStatus" "StudentStatus" NOT NULL,
    "toStatus" "StudentStatus" NOT NULL,
    "reason" VARCHAR(255),
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_status_changes_studentId_changedAt_idx" ON "student_status_changes"("studentId", "changedAt");

-- CreateIndex
CREATE INDEX "student_status_changes_toStatus_changedAt_idx" ON "student_status_changes"("toStatus", "changedAt");

-- CreateIndex
CREATE INDEX "student_status_changes_changedAt_idx" ON "student_status_changes"("changedAt");

-- CreateIndex
CREATE INDEX "students_riskLevel_deletedAt_idx" ON "students"("riskLevel", "deletedAt");

-- AddForeignKey
ALTER TABLE "student_status_changes" ADD CONSTRAINT "student_status_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_changes" ADD CONSTRAINT "student_status_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

