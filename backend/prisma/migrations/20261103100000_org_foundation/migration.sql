-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'HR_UPDATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmployeePosition" ADD VALUE 'RECEPTIONIST';
ALTER TYPE "EmployeePosition" ADD VALUE 'MARKETING_MANAGER';
ALTER TYPE "EmployeePosition" ADD VALUE 'CONTENT_CREATOR';
ALTER TYPE "EmployeePosition" ADD VALUE 'OPERATIONS_MANAGER';
ALTER TYPE "EmployeePosition" ADD VALUE 'STUDENT_SUCCESS_MANAGER';
ALTER TYPE "EmployeePosition" ADD VALUE 'ACADEMIC_COORDINATOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "TaskStatus" ADD VALUE 'REVIEW';

-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "probationEndDate" DATE;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "probationEndDate" DATE;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "expectedResult" VARCHAR(1000),
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "employees_probationEndDate_idx" ON "employees"("probationEndDate");

-- CreateIndex
CREATE INDEX "employees_managerId_idx" ON "employees"("managerId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

