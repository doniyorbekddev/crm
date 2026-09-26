-- CreateEnum
CREATE TYPE "RecurringHomeworkFrequency" AS ENUM ('DAILY', 'WEEKLY', 'WEEKDAYS');

-- AlterTable
ALTER TABLE "homework" ADD COLUMN     "occurrenceDate" DATE,
ADD COLUMN     "recurringHomeworkId" TEXT;

-- CreateTable
CREATE TABLE "recurring_homeworks" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "maxPoints" SMALLINT NOT NULL DEFAULT 100,
    "xpReward" INTEGER NOT NULL DEFAULT 20,
    "frequency" "RecurringHomeworkFrequency" NOT NULL,
    "weekdays" "WeekDay"[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "publishTime" VARCHAR(5) NOT NULL DEFAULT '08:00',
    "deadlineTime" VARCHAR(5) NOT NULL DEFAULT '23:59',
    "deadlineOffsetDays" SMALLINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_homeworks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_homeworks_isActive_startDate_idx" ON "recurring_homeworks"("isActive", "startDate");

-- CreateIndex
CREATE INDEX "recurring_homeworks_groupId_idx" ON "recurring_homeworks"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "homework_recurringHomeworkId_occurrenceDate_key" ON "homework"("recurringHomeworkId", "occurrenceDate");

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_recurringHomeworkId_fkey" FOREIGN KEY ("recurringHomeworkId") REFERENCES "recurring_homeworks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_homeworks" ADD CONSTRAINT "recurring_homeworks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_homeworks" ADD CONSTRAINT "recurring_homeworks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

