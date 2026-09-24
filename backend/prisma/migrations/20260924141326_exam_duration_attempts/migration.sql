-- PHASE 14 (4-qism): imtihon davomiyligi va urinishlar chegarasi.
--
-- `exams.durationMinutes` — vaqt chegarasi (bo'sh bo'lsa cheklanmagan),
-- `exams.maxAttempts` — ruxsat etilgan urinishlar soni (0 — cheklanmagan),
-- `AttemptStatus.EXPIRED` — vaqt tugagach topshirilmagan urinish.
--
-- Mavjud imtihonlar o'zgarmaydi: ikkala ustun ham bo'sh/0 qiymat bilan qo'shiladi,
-- ya'ni hozirgi xatti-harakat (cheklovsiz) saqlanadi.

-- AlterEnum
ALTER TYPE "AttemptStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "durationMinutes" SMALLINT,
ADD COLUMN     "maxAttempts" SMALLINT NOT NULL DEFAULT 0;



-- ===== Cheklovlar =====
ALTER TABLE "exams" ADD CONSTRAINT "exams_duration_check"
  CHECK ("durationMinutes" IS NULL OR ("durationMinutes" > 0 AND "durationMinutes" <= 600));
ALTER TABLE "exams" ADD CONSTRAINT "exams_attempts_check" CHECK ("maxAttempts" >= 0 AND "maxAttempts" <= 20);
