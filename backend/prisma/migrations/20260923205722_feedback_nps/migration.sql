-- PHASE 8 (1-qism): o'quvchi fikri va NPS.
--
-- `feedback` jadvali: o'qituvchi, kurs va markaz bahosi (1–5) hamda tavsiya ehtimoli (NPS, 0–10).
-- Anonim fikrda ham o'quvchi bog'lanadi (takror javobni oldini olish va statistika uchun),
-- lekin xodimga ismi ko'rsatilmaydi.
--
-- Mavjud ma'lumotga ta'sir qilmaydi: faqat yangi jadval va yangi bildirishnoma turi qo'shiladi.

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('TEACHER', 'COURSE', 'ACADEMY', 'NPS');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'NEGATIVE_FEEDBACK';

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "teacherId" TEXT,
    "courseId" TEXT,
    "groupId" TEXT,
    "rating" SMALLINT,
    "npsScore" SMALLINT,
    "comment" VARCHAR(1000),
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    "handleNote" VARCHAR(500),
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_type_createdAt_idx" ON "feedback"("type", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_teacherId_createdAt_idx" ON "feedback"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_studentId_createdAt_idx" ON "feedback"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "feedback_branchId_idx" ON "feedback"("branchId");

-- CreateIndex
CREATE INDEX "feedback_handledAt_idx" ON "feedback"("handledAt");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ===== Cheklovlar: baho oralig'i bazada ham tekshiriladi =====
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_rating_check"
  CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 5));
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_nps_check"
  CHECK ("npsScore" IS NULL OR ("npsScore" >= 0 AND "npsScore" <= 10));
-- NPS fikrida npsScore, qolganlarida rating bo'lishi shart
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_value_check"
  CHECK (("type" = 'NPS' AND "npsScore" IS NOT NULL) OR ("type" <> 'NPS' AND "rating" IS NOT NULL));
-- O'qituvchi haqidagi fikr o'qituvchisiz bo'lmaydi
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teacher_check"
  CHECK ("type" <> 'TEACHER' OR "teacherId" IS NOT NULL);
