-- =====================================================================
-- Kurrikulum: Kurs → Modul → Mavzu va o'quvchi progressi — PHASE 6 (1-qism)
--
--   1. course_modules / course_topics — kurs dasturi;
--   2. student_topic_progress — o'quvchining mavzu bo'yicha holati.
--      Yozuv faqat holat o'zgarganda yaratiladi: yozuvi yo'q mavzu
--      NOT_STARTED hisoblanadi (bo'sh qatorlar yig'ilib qolmaydi);
--   3. attendance_sessions.topicId — dars qaysi mavzuga tegishli
--      (erkin matnli `topic` ustuni saqlanadi).
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateEnum
CREATE TYPE "TopicProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "attendance_sessions" ADD COLUMN     "topicId" TEXT;

-- CreateTable
CREATE TABLE "course_modules" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_topics" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "lessonCount" SMALLINT NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_topic_progress" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "status" "TopicProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedAt" TIMESTAMP(3),
    "markedById" TEXT,
    "note" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_topic_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_modules_courseId_sortOrder_idx" ON "course_modules"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "course_topics_moduleId_sortOrder_idx" ON "course_topics"("moduleId", "sortOrder");

-- CreateIndex
CREATE INDEX "student_topic_progress_topicId_status_idx" ON "student_topic_progress"("topicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_topic_progress_studentId_topicId_key" ON "student_topic_progress"("studentId", "topicId");

-- AddForeignKey
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_progress" ADD CONSTRAINT "student_topic_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_progress" ADD CONSTRAINT "student_topic_progress_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_topic_progress" ADD CONSTRAINT "student_topic_progress_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Dars soni musbat bo'lishi shart
ALTER TABLE "course_topics" ADD CONSTRAINT "course_topics_lesson_count_check" CHECK ("lessonCount" > 0);
