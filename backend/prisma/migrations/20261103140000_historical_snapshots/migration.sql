-- AlterEnum
ALTER TYPE "FinancialPeriodStatus" ADD VALUE 'LOCKED';

-- AlterTable
ALTER TABLE "financial_periods" ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" TEXT;

-- CreateTable
CREATE TABLE "student_month_snapshots" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL,
    "groupId" TEXT,
    "courseId" TEXT NOT NULL,
    "contractAmount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL,
    "debtAmount" DECIMAL(14,2) NOT NULL,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_month_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_month_snapshots_year_month_branchId_idx" ON "student_month_snapshots"("year", "month", "branchId");

-- CreateIndex
CREATE INDEX "student_month_snapshots_year_month_groupId_idx" ON "student_month_snapshots"("year", "month", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "student_month_snapshots_studentId_year_month_key" ON "student_month_snapshots"("studentId", "year", "month");

-- AddForeignKey
ALTER TABLE "financial_periods" ADD CONSTRAINT "financial_periods_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_month_snapshots" ADD CONSTRAINT "student_month_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_month_snapshots" ADD CONSTRAINT "student_month_snapshots_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

