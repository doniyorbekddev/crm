-- CreateEnum
CREATE TYPE "HomeworkTarget" AS ENUM ('GROUP', 'SELECTED', 'INDIVIDUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'HOMEWORK_DEADLINE';
ALTER TYPE "NotificationType" ADD VALUE 'HOMEWORK_RETURNED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubmissionStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "SubmissionStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "homework" ADD COLUMN     "difficulty" "QuestionDifficulty",
ADD COLUMN     "lessonId" TEXT,
ADD COLUMN     "rubricId" TEXT,
ADD COLUMN     "targetType" "HomeworkTarget" NOT NULL DEFAULT 'GROUP',
ADD COLUMN     "topicId" TEXT;

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "codeLanguage" VARCHAR(30),
ADD COLUMN     "codeText" TEXT,
ADD COLUMN     "linkUrl" VARCHAR(1000),
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "rubricScores" JSONB;

-- CreateTable
CREATE TABLE "homework_attachments" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "kind" "LessonMaterialKind" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "url" VARCHAR(1000),
    "storagePath" VARCHAR(500),
    "originalName" VARCHAR(255),
    "mimeType" VARCHAR(100),
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_attachments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "storagePath" VARCHAR(500) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "criteria" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homework_attachments_homeworkId_idx" ON "homework_attachments"("homeworkId");

-- CreateIndex
CREATE INDEX "submission_attachments_submissionId_idx" ON "submission_attachments"("submissionId");

-- CreateIndex
CREATE INDEX "rubrics_isActive_idx" ON "rubrics"("isActive");

-- CreateIndex
CREATE INDEX "homework_topicId_idx" ON "homework"("topicId");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_attachments" ADD CONSTRAINT "homework_attachments_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_attachments" ADD CONSTRAINT "submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Ma'lumotni ko'chirish (o'chirmasdan): eski yagona fayl yangi ko'p-faylli jadvalga ham yoziladi.
-- `attachmentPath` ustuni saqlanadi (orqaga moslik). Vaqt — yozuvning o'z vaqtidan (now() emas).
INSERT INTO "submission_attachments" ("id", "submissionId", "storagePath", "originalName", "mimeType", "size", "createdAt")
SELECT
  'mig_' || s."id",
  s."id",
  s."attachmentPath",
  'javob.' || lower(regexp_replace(s."attachmentPath", '^.*\.', '')),
  CASE lower(regexp_replace(s."attachmentPath", '^.*\.', ''))
    WHEN 'pdf' THEN 'application/pdf'
    WHEN 'png' THEN 'image/png'
    WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'webp' THEN 'image/webp'
    ELSE 'application/octet-stream'
  END,
  0,
  COALESCE(s."submittedAt", s."updatedAt")
FROM "homework_submissions" s
WHERE s."attachmentPath" IS NOT NULL;
