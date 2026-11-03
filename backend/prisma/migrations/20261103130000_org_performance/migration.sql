-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "PerformanceRating" AS ENUM ('BELOW', 'MEETS', 'EXCEEDS');

-- CreateEnum
CREATE TYPE "StaffAwardType" AS ENUM ('EMPLOYEE_OF_MONTH', 'EMPLOYEE_OF_QUARTER', 'SPECIAL', 'TRAINING');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "departmentId" TEXT;

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeId" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" SMALLINT NOT NULL,
    "positionKey" VARCHAR(40) NOT NULL,
    "positionTitle" VARCHAR(120) NOT NULL,
    "kpiAverage" DECIMAL(5,2),
    "attendanceRate" DECIMAL(5,2),
    "scores" JSONB NOT NULL,
    "overallScore" DECIMAL(3,2) NOT NULL,
    "rating" "PerformanceRating" NOT NULL,
    "strengths" VARCHAR(2000),
    "improvements" VARCHAR(2000),
    "goals" VARCHAR(2000),
    "recommendPromotion" BOOLEAN NOT NULL DEFAULT false,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewerId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_awards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffAwardType" NOT NULL,
    "year" INTEGER NOT NULL,
    "period" SMALLINT,
    "title" VARCHAR(150) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "amount" DECIMAL(14,2),
    "salaryPeriodId" TEXT,
    "createdById" TEXT,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_recommendations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromPositionKey" VARCHAR(40) NOT NULL,
    "toPositionKey" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "kpiAverage" DECIMAL(5,2),
    "monthsInPosition" SMALLINT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "effectiveDate" DATE,
    "recommendedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(500),
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotion_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_reviews_year_quarter_status_idx" ON "performance_reviews"("year", "quarter", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_branchId_status_idx" ON "performance_reviews"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_userId_year_quarter_key" ON "performance_reviews"("userId", "year", "quarter");

-- CreateIndex
CREATE INDEX "staff_awards_userId_year_idx" ON "staff_awards"("userId", "year");

-- CreateIndex
CREATE INDEX "staff_awards_type_year_period_idx" ON "staff_awards"("type", "year", "period");

-- CreateIndex
CREATE INDEX "promotion_recommendations_status_createdAt_idx" ON "promotion_recommendations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "promotion_recommendations_employeeId_status_idx" ON "promotion_recommendations"("employeeId", "status");

-- CreateIndex
CREATE INDEX "expenses_departmentId_spentAt_idx" ON "expenses"("departmentId", "spentAt");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_awards" ADD CONSTRAINT "staff_awards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_awards" ADD CONSTRAINT "staff_awards_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

