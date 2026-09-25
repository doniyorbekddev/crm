-- AlterTable
ALTER TABLE "student_progress_snapshots" ADD COLUMN     "masteryScore" SMALLINT,
ADD COLUMN     "topicsMastered" SMALLINT NOT NULL DEFAULT 0;

