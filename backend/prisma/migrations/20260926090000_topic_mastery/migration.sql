-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'PRACTICING', 'MASTERED');

-- CreateTable
CREATE TABLE "topic_mastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "score" SMALLINT,
    "status" "MasteryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "examScore" SMALLINT,
    "homeworkScore" SMALLINT,
    "attendanceScore" SMALLINT,
    "lessonScore" SMALLINT,
    "evidence" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topic_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "topic_mastery_topicId_status_idx" ON "topic_mastery"("topicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "topic_mastery_studentId_topicId_key" ON "topic_mastery"("studentId", "topicId");

-- AddForeignKey
ALTER TABLE "topic_mastery" ADD CONSTRAINT "topic_mastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_mastery" ADD CONSTRAINT "topic_mastery_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "course_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

