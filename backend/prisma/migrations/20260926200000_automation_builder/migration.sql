-- CreateEnum
CREATE TYPE "AutomationSchedule" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'ACADEMIC_RISK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'HOMEWORK_COMPLETION_LOW';
ALTER TYPE "AutomationTrigger" ADD VALUE 'EXAM_SCORE_LOW';
ALTER TYPE "AutomationTrigger" ADD VALUE 'MASTERY_LOW';
ALTER TYPE "AutomationTrigger" ADD VALUE 'NO_LOGIN_DAYS';
ALTER TYPE "AutomationTrigger" ADD VALUE 'NO_SUBMISSION_DAYS';

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "actions" JSONB,
ADD COLUMN     "conditions" JSONB,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "schedule" "AutomationSchedule",
ADD COLUMN     "scheduleHour" SMALLINT,
ADD COLUMN     "scheduleWeekday" SMALLINT;

-- AlterTable
ALTER TABLE "automation_runs" ADD COLUMN     "actionsDone" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "entityType" VARCHAR(30),
    "entityId" VARCHAR(50),
    "link" VARCHAR(200),
    "ruleId" TEXT,
    "dedupeKey" VARCHAR(200),
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tasks_dedupeKey_key" ON "tasks"("dedupeKey");

-- CreateIndex
CREATE INDEX "tasks_assigneeId_status_dueAt_idx" ON "tasks"("assigneeId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_status_createdAt_idx" ON "tasks"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

