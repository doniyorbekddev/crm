-- CreateEnum
CREATE TYPE "ComplaintSource" AS ENUM ('STUDENT', 'PARENT', 'STAFF', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('SERVICE', 'TEACHER', 'PAYMENT', 'SCHEDULE', 'SAFETY', 'STAFF_CONFLICT', 'SUGGESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintSeverity" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplaintEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'ESCALATED', 'COMMENT');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('NEW', 'INTERVIEW', 'DEMO', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "HrChecklistKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "HrChecklistStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'IN_STORAGE', 'UNDER_REPAIR', 'WRITTEN_OFF', 'LOST');

-- CreateEnum
CREATE TYPE "AssetEventType" AS ENUM ('CREATED', 'UPDATED', 'ASSIGNED', 'MOVED', 'STATUS_CHANGED', 'REPAIR');

-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('JOB_DESCRIPTION', 'POLICY', 'VIDEO_GUIDE', 'SALES_SCRIPT', 'LESSON_STANDARD', 'MATERIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMPLAINT_UPDATE';
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_REQUEST';

-- AlterEnum
ALTER TYPE "ApprovalType" ADD VALUE 'DISCOUNT';

-- AlterTable
ALTER TABLE "student_discounts" ADD COLUMN     "approvedById" TEXT;

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "ComplaintSource" NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "severity" "ComplaintSeverity" NOT NULL DEFAULT 'NORMAL',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "studentId" TEXT,
    "contactName" VARCHAR(150),
    "contactPhone" VARCHAR(32),
    "subjectUserId" TEXT,
    "reporterId" TEXT,
    "assigneeId" TEXT,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "escalatedById" TEXT,
    "resolution" VARCHAR(2000),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "overdueNotifiedAt" TIMESTAMP(3),
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_events" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "type" "ComplaintEventType" NOT NULL,
    "fromStatus" "ComplaintStatus",
    "toStatus" "ComplaintStatus",
    "note" VARCHAR(2000),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_requests" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(255),
    "discountId" TEXT,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(32),
    "email" VARCHAR(255),
    "position" "EmployeePosition",
    "isTeacher" BOOLEAN NOT NULL DEFAULT false,
    "positionTitle" VARCHAR(120),
    "source" VARCHAR(100),
    "stage" "CandidateStage" NOT NULL DEFAULT 'NEW',
    "interviewAt" TIMESTAMP(3),
    "demoAt" TIMESTAMP(3),
    "score" SMALLINT,
    "notes" VARCHAR(4000),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(500),
    "employeeId" TEXT,
    "createdById" TEXT,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_events" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "fromStage" "CandidateStage",
    "toStage" "CandidateStage",
    "note" VARCHAR(2000),
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_checklists" (
    "id" TEXT NOT NULL,
    "kind" "HrChecklistKind" NOT NULL,
    "status" "HrChecklistStatus" NOT NULL DEFAULT 'OPEN',
    "employeeId" TEXT,
    "userId" TEXT,
    "subjectName" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(500),
    "lastWorkingDay" DATE,
    "dueDate" DATE,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_checklist_items" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "key" VARCHAR(40),
    "title" VARCHAR(200) NOT NULL,
    "responsibleId" TEXT,
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "note" VARCHAR(500),

    CONSTRAINT "hr_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "inventoryNumber" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "serialNumber" VARCHAR(100),
    "purchaseDate" DATE,
    "purchaseCost" DECIMAL(14,2),
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
    "roomId" TEXT,
    "location" VARCHAR(150),
    "responsibleId" TEXT,
    "note" VARCHAR(1000),
    "createdById" TEXT,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_events" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetEventType" NOT NULL,
    "fromValue" VARCHAR(200),
    "toValue" VARCHAR(200),
    "cost" DECIMAL(14,2),
    "note" VARCHAR(1000),
    "actorId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_articles" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "videoUrl" VARCHAR(500),
    "audienceRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" "EmployeePosition",
    "version" INTEGER NOT NULL DEFAULT 1,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_article_versions" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "videoUrl" VARCHAR(500),
    "changeNote" VARCHAR(255),
    "editorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_acknowledgements" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "complaints_number_key" ON "complaints"("number");

-- CreateIndex
CREATE INDEX "complaints_branchId_status_idx" ON "complaints"("branchId", "status");

-- CreateIndex
CREATE INDEX "complaints_assigneeId_status_idx" ON "complaints"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "complaints_status_dueAt_idx" ON "complaints"("status", "dueAt");

-- CreateIndex
CREATE INDEX "complaints_reporterId_idx" ON "complaints"("reporterId");

-- CreateIndex
CREATE INDEX "complaints_studentId_idx" ON "complaints"("studentId");

-- CreateIndex
CREATE INDEX "complaints_createdAt_idx" ON "complaints"("createdAt");

-- CreateIndex
CREATE INDEX "complaint_events_complaintId_createdAt_idx" ON "complaint_events"("complaintId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "discount_requests_discountId_key" ON "discount_requests"("discountId");

-- CreateIndex
CREATE INDEX "discount_requests_status_createdAt_idx" ON "discount_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "discount_requests_studentId_status_idx" ON "discount_requests"("studentId", "status");

-- CreateIndex
CREATE INDEX "discount_requests_branchId_status_idx" ON "discount_requests"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_employeeId_key" ON "candidates"("employeeId");

-- CreateIndex
CREATE INDEX "candidates_branchId_stage_idx" ON "candidates"("branchId", "stage");

-- CreateIndex
CREATE INDEX "candidates_createdAt_idx" ON "candidates"("createdAt");

-- CreateIndex
CREATE INDEX "candidate_events_candidateId_createdAt_idx" ON "candidate_events"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "hr_checklists_kind_status_idx" ON "hr_checklists"("kind", "status");

-- CreateIndex
CREATE INDEX "hr_checklists_employeeId_idx" ON "hr_checklists"("employeeId");

-- CreateIndex
CREATE INDEX "hr_checklists_userId_idx" ON "hr_checklists"("userId");

-- CreateIndex
CREATE INDEX "hr_checklists_branchId_status_idx" ON "hr_checklists"("branchId", "status");

-- CreateIndex
CREATE INDEX "hr_checklist_items_checklistId_sortOrder_idx" ON "hr_checklist_items"("checklistId", "sortOrder");

-- CreateIndex
CREATE INDEX "hr_checklist_items_responsibleId_doneAt_idx" ON "hr_checklist_items"("responsibleId", "doneAt");

-- CreateIndex
CREATE INDEX "assets_branchId_status_idx" ON "assets"("branchId", "status");

-- CreateIndex
CREATE INDEX "assets_responsibleId_status_idx" ON "assets"("responsibleId", "status");

-- CreateIndex
CREATE INDEX "assets_category_idx" ON "assets"("category");

-- CreateIndex
CREATE UNIQUE INDEX "assets_branchId_inventoryNumber_key" ON "assets"("branchId", "inventoryNumber");

-- CreateIndex
CREATE INDEX "asset_events_assetId_occurredAt_idx" ON "asset_events"("assetId", "occurredAt");

-- CreateIndex
CREATE INDEX "asset_events_type_occurredAt_idx" ON "asset_events"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "knowledge_articles_status_category_idx" ON "knowledge_articles"("status", "category");

-- CreateIndex
CREATE INDEX "knowledge_articles_position_idx" ON "knowledge_articles"("position");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_article_versions_articleId_version_key" ON "knowledge_article_versions"("articleId", "version");

-- CreateIndex
CREATE INDEX "knowledge_acknowledgements_userId_idx" ON "knowledge_acknowledgements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_acknowledgements_articleId_userId_version_key" ON "knowledge_acknowledgements"("articleId", "userId", "version");

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_requests" ADD CONSTRAINT "discount_requests_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "student_discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_events" ADD CONSTRAINT "candidate_events_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_events" ADD CONSTRAINT "candidate_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklists" ADD CONSTRAINT "hr_checklists_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "hr_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_checklist_items" ADD CONSTRAINT "hr_checklist_items_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_events" ADD CONSTRAINT "asset_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_article_versions" ADD CONSTRAINT "knowledge_article_versions_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_acknowledgements" ADD CONSTRAINT "knowledge_acknowledgements_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_acknowledgements" ADD CONSTRAINT "knowledge_acknowledgements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

