-- CRM 4.0, 2-faza (ish qatlami). Faqat qo'shimcha: mavjud ustun va ma'lumot o'zgarmaydi.

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TASK_UPDATE';

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'AUTOMATION', 'ALERT', 'NOTIFICATION', 'ESCALATION');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('EXPENSE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actionUrl" VARCHAR(300),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "alertId" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "notificationId" VARCHAR(50),
ADD COLUMN     "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "source" "TaskSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "changedById" TEXT,
    "note" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" TEXT NOT NULL,
    "type" "ApprovalType" NOT NULL,
    "entityType" VARCHAR(30) NOT NULL,
    "entityId" VARCHAR(50) NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "title" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(14,2),
    "link" VARCHAR(200),
    "branchId" VARCHAR(50),
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "reason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_comments_taskId_createdAt_idx" ON "task_comments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "task_assignments_taskId_createdAt_idx" ON "task_assignments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "approval_requests_status_createdAt_idx" ON "approval_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "approval_requests_branchId_status_idx" ON "approval_requests"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_entityType_entityId_key" ON "approval_requests"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "alerts_assigneeId_resolvedAt_idx" ON "alerts"("assigneeId", "resolvedAt");

-- CreateIndex
CREATE INDEX "tasks_createdById_status_idx" ON "tasks"("createdById", "status");

-- CreateIndex
CREATE INDEX "tasks_alertId_idx" ON "tasks"("alertId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Qoida yaratgan mavjud vazifalar manbasi (yangi ustun, standart qiymati MANUAL)
UPDATE "tasks" SET "source" = 'AUTOMATION' WHERE "ruleId" IS NOT NULL OR "dedupeKey" IS NOT NULL;

-- Hozir tasdiq kutayotgan xarajatlar "Ishlarim" markazida ko'rinishi uchun
INSERT INTO "approval_requests" ("id", "type", "entityType", "entityId", "status", "title", "amount", "link", "branchId", "requestedById", "createdAt", "updatedAt")
SELECT 'apr_' || e."id", 'EXPENSE', 'expense', e."id", 'PENDING',
       LEFT('Xarajat #' || e."number" || ' · ' || c."name" || COALESCE(' — ' || NULLIF(e."description", ''), ''), 200),
       e."amount", '/expenses', e."branchId", e."responsibleId", e."createdAt", CURRENT_TIMESTAMP
FROM "expenses" e
JOIN "expense_categories" c ON c."id" = e."categoryId"
WHERE e."status" = 'PENDING'
ON CONFLICT ("entityType", "entityId") DO NOTHING;
