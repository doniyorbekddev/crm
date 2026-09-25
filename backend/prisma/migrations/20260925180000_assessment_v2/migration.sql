-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('DAILY_QUIZ', 'WEEKLY_TEST', 'MONTHLY_EXAM', 'MIDTERM', 'FINAL', 'PRACTICE', 'DIAGNOSTIC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'TRUE_FALSE';
ALTER TYPE "QuestionType" ADD VALUE 'SHORT_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'LONG_TEXT';
ALTER TYPE "QuestionType" ADD VALUE 'CODE';
ALTER TYPE "QuestionType" ADD VALUE 'FILE_UPLOAD';

-- AlterTable
ALTER TABLE "exam_answers" ADD COLUMN     "filePath" VARCHAR(500);

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "blueprint" JSONB,
ADD COLUMN     "endAt" TIMESTAMP(3),
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "type" "ExamType" NOT NULL DEFAULT 'MONTHLY_EXAM';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "acceptedAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "explanation" VARCHAR(1000),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "attempt_questions" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "points" SMALLINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_questions_attemptId_sortOrder_idx" ON "attempt_questions"("attemptId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_questions_attemptId_examQuestionId_key" ON "attempt_questions"("attemptId", "examQuestionId");

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

