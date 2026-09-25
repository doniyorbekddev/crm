-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LessonMaterialKind" AS ENUM ('FILE', 'LINK', 'VIDEO');

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "content" TEXT,
    "teacherId" TEXT,
    "durationMinutes" SMALLINT,
    "videoUrl" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_materials" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "kind" "LessonMaterialKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "url" VARCHAR(1000),
    "storagePath" VARCHAR(500),
    "originalName" VARCHAR(255),
    "mimeType" VARCHAR(100),
    "size" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_topicId_status_sortOrder_idx" ON "lessons"("topicId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "lessons_status_publishedAt_idx" ON "lessons"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "lesson_materials_lessonId_sortOrder_idx" ON "lesson_materials"("lessonId", "sortOrder");

-- CreateIndex
CREATE INDEX "lesson_progress_studentId_lastViewedAt_idx" ON "lesson_progress"("studentId", "lastViewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_lessonId_studentId_key" ON "lesson_progress"("lessonId", "studentId");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

