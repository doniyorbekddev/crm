-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('ATTENDANCE', 'HOMEWORK', 'EXAM', 'STREAK', 'REFERRAL', 'COURSE_COMPLETED', 'BADGE', 'MANUAL');

-- CreateEnum
CREATE TYPE "BadgeRule" AS ENUM ('MANUAL', 'STREAK_DAYS', 'ATTENDANCE_RATE', 'HOMEWORK_COUNT', 'EXAM_SCORE', 'XP_TOTAL', 'COURSE_COMPLETED');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('FIXED', 'PER_LESSON', 'PER_STUDENT', 'PERCENTAGE', 'MIXED');

-- CreateEnum
CREATE TYPE "SalaryPeriodStatus" AS ENUM ('PENDING', 'CALCULATED', 'APPROVED', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK', 'CARD', 'CLICK', 'PAYME', 'UZUM', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'VOID', 'REVERSED');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'LATE', 'GRADED', 'MISSED');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('PLANNED', 'HELD', 'GRADED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ParentRelation" AS ENUM ('MOTHER', 'FATHER', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('HIGH_DEBT', 'LOW_ATTENDANCE', 'HIGH_DROPOUT', 'OVERDUE_FOLLOWUPS', 'UNPAID_SALARY', 'BUDGET_EXCEEDED', 'LOW_GROUP_CAPACITY', 'SALES_TARGET_ACHIEVED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('LEADS', 'SALES', 'REVENUE');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "transactionId" TEXT;

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT,
    "date" DATE NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "topic" VARCHAR(200),
    "note" VARCHAR(500),
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'HELD',
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gamification_profiles" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "levelNumber" INTEGER NOT NULL DEFAULT 1,
    "lastXpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gamification_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_rules" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(255),
    "source" "XpSource" NOT NULL,
    "points" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "xp_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xp_transactions" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "source" "XpSource" NOT NULL,
    "ruleKey" VARCHAR(50),
    "description" VARCHAR(255) NOT NULL,
    "entityType" VARCHAR(50),
    "entityId" VARCHAR(50),
    "awardedById" TEXT,
    "dedupeKey" VARCHAR(150),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "minXp" INTEGER NOT NULL,
    "icon" VARCHAR(16),
    "color" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "icon" VARCHAR(16) NOT NULL,
    "rule" "BadgeRule" NOT NULL DEFAULT 'MANUAL',
    "threshold" INTEGER,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_badges" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "note" VARCHAR(255),
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastAttendanceDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specialization" VARCHAR(150),
    "experienceYears" SMALLINT,
    "hireDate" DATE,
    "bio" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_salary_rules" (
    "id" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "type" "SalaryType" NOT NULL,
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "perLessonRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "perStudentRate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_salary_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_salary_periods" (
    "id" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "salaryType" "SalaryType" NOT NULL,
    "lessonsCount" INTEGER NOT NULL DEFAULT 0,
    "studentsCount" INTEGER NOT NULL DEFAULT 0,
    "groupRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "baseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lessonAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "studentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percentageAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "penalty" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SalaryPeriodStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(255),
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_salary_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_salary_payments" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "AccountType" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "amount" DECIMAL(14,2) NOT NULL,
    "accountId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(255),
    "categoryName" VARCHAR(100),
    "entityType" VARCHAR(50),
    "entityId" VARCHAR(50),
    "createdById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" VARCHAR(255),
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_categories" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(255),
    "studentId" TEXT,
    "responsibleId" TEXT,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" VARCHAR(255),
    "attachmentPath" VARCHAR(500),
    "responsibleId" TEXT,
    "transactionId" TEXT NOT NULL,
    "salaryPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "plannedAmount" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(255),

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "telegram" VARCHAR(64),
    "email" VARCHAR(255),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "relation" "ParentRelation" NOT NULL DEFAULT 'GUARDIAN',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "courseId" TEXT,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "maxPoints" SMALLINT NOT NULL DEFAULT 100,
    "xpReward" INTEGER NOT NULL DEFAULT 20,
    "attachmentPath" VARCHAR(500),
    "status" "HomeworkStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "score" SMALLINT,
    "feedback" VARCHAR(500),
    "attachmentPath" VARCHAR(500),
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "courseId" TEXT,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT,
    "date" DATE NOT NULL,
    "maxScore" SMALLINT NOT NULL DEFAULT 100,
    "passScore" SMALLINT,
    "xpReward" INTEGER NOT NULL DEFAULT 50,
    "status" "ExamStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_results" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" SMALLINT NOT NULL,
    "percentage" SMALLINT NOT NULL,
    "grade" VARCHAR(4),
    "comment" VARCHAR(500),
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_progress_snapshots" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "attendanceRate" SMALLINT NOT NULL DEFAULT 0,
    "homeworkRate" SMALLINT NOT NULL DEFAULT 0,
    "averageScore" SMALLINT NOT NULL DEFAULT 0,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "levelNumber" SMALLINT NOT NULL DEFAULT 1,
    "debtRemaining" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_progress_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "year" INTEGER NOT NULL,
    "month" SMALLINT NOT NULL,
    "type" "TargetType" NOT NULL,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'WARNING',
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" VARCHAR(50),
    "entityId" VARCHAR(50),
    "metadata" JSONB,
    "dedupeKey" VARCHAR(150),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_sessions_teacherId_date_idx" ON "attendance_sessions"("teacherId", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_date_idx" ON "attendance_sessions"("date");

-- CreateIndex
CREATE INDEX "attendance_sessions_status_date_idx" ON "attendance_sessions"("status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_groupId_date_key" ON "attendance_sessions"("groupId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gamification_profiles_studentId_key" ON "gamification_profiles"("studentId");

-- CreateIndex
CREATE INDEX "gamification_profiles_totalXp_idx" ON "gamification_profiles"("totalXp");

-- CreateIndex
CREATE UNIQUE INDEX "xp_rules_key_key" ON "xp_rules"("key");

-- CreateIndex
CREATE UNIQUE INDEX "xp_transactions_dedupeKey_key" ON "xp_transactions"("dedupeKey");

-- CreateIndex
CREATE INDEX "xp_transactions_studentId_createdAt_idx" ON "xp_transactions"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "xp_transactions_source_createdAt_idx" ON "xp_transactions"("source", "createdAt");

-- CreateIndex
CREATE INDEX "xp_transactions_createdAt_idx" ON "xp_transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "levels_number_key" ON "levels"("number");

-- CreateIndex
CREATE UNIQUE INDEX "levels_minXp_key" ON "levels"("minXp");

-- CreateIndex
CREATE UNIQUE INDEX "badges_key_key" ON "badges"("key");

-- CreateIndex
CREATE INDEX "student_badges_awardedAt_idx" ON "student_badges"("awardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_badges_studentId_badgeId_key" ON "student_badges"("studentId", "badgeId");

-- CreateIndex
CREATE UNIQUE INDEX "streaks_studentId_key" ON "streaks"("studentId");

-- CreateIndex
CREATE INDEX "streaks_current_idx" ON "streaks"("current");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_userId_key" ON "teacher_profiles"("userId");

-- CreateIndex
CREATE INDEX "teacher_profiles_isActive_idx" ON "teacher_profiles"("isActive");

-- CreateIndex
CREATE INDEX "teacher_salary_rules_teacherProfileId_effectiveFrom_idx" ON "teacher_salary_rules"("teacherProfileId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "teacher_salary_rules_isActive_idx" ON "teacher_salary_rules"("isActive");

-- CreateIndex
CREATE INDEX "teacher_salary_periods_year_month_idx" ON "teacher_salary_periods"("year", "month");

-- CreateIndex
CREATE INDEX "teacher_salary_periods_status_idx" ON "teacher_salary_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_salary_periods_teacherProfileId_year_month_key" ON "teacher_salary_periods"("teacherProfileId", "year", "month");

-- CreateIndex
CREATE INDEX "teacher_salary_payments_periodId_idx" ON "teacher_salary_payments"("periodId");

-- CreateIndex
CREATE INDEX "teacher_salary_payments_paidAt_idx" ON "teacher_salary_payments"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "financial_accounts_key_key" ON "financial_accounts"("key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_number_key" ON "transactions"("number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reversalOfId_key" ON "transactions"("reversalOfId");

-- CreateIndex
CREATE INDEX "transactions_occurredAt_idx" ON "transactions"("occurredAt");

-- CreateIndex
CREATE INDEX "transactions_type_occurredAt_idx" ON "transactions"("type", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_status_occurredAt_idx" ON "transactions"("status", "occurredAt");

-- CreateIndex
CREATE INDEX "transactions_entityType_entityId_idx" ON "transactions"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "income_categories_key_key" ON "income_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_key_key" ON "expense_categories"("key");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_number_key" ON "incomes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "incomes_transactionId_key" ON "incomes"("transactionId");

-- CreateIndex
CREATE INDEX "incomes_receivedAt_idx" ON "incomes"("receivedAt");

-- CreateIndex
CREATE INDEX "incomes_categoryId_receivedAt_idx" ON "incomes"("categoryId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_number_key" ON "expenses"("number");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_transactionId_key" ON "expenses"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_salaryPaymentId_key" ON "expenses"("salaryPaymentId");

-- CreateIndex
CREATE INDEX "expenses_spentAt_idx" ON "expenses"("spentAt");

-- CreateIndex
CREATE INDEX "expenses_categoryId_spentAt_idx" ON "expenses"("categoryId", "spentAt");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_year_month_key" ON "budgets"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "budget_lines_budgetId_categoryId_key" ON "budget_lines"("budgetId", "categoryId");

-- CreateIndex
CREATE INDEX "parents_phone_idx" ON "parents"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "student_parents_studentId_parentId_key" ON "student_parents"("studentId", "parentId");

-- CreateIndex
CREATE INDEX "homework_groupId_deadline_idx" ON "homework"("groupId", "deadline");

-- CreateIndex
CREATE INDEX "homework_status_deadline_idx" ON "homework"("status", "deadline");

-- CreateIndex
CREATE INDEX "homework_submissions_studentId_status_idx" ON "homework_submissions"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_homeworkId_studentId_key" ON "homework_submissions"("homeworkId", "studentId");

-- CreateIndex
CREATE INDEX "exams_groupId_date_idx" ON "exams"("groupId", "date");

-- CreateIndex
CREATE INDEX "exams_status_date_idx" ON "exams"("status", "date");

-- CreateIndex
CREATE INDEX "exam_results_studentId_idx" ON "exam_results"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_results_examId_studentId_key" ON "exam_results"("examId", "studentId");

-- CreateIndex
CREATE INDEX "student_progress_snapshots_year_month_idx" ON "student_progress_snapshots"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "student_progress_snapshots_studentId_year_month_key" ON "student_progress_snapshots"("studentId", "year", "month");

-- CreateIndex
CREATE INDEX "sales_targets_year_month_idx" ON "sales_targets"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "sales_targets_userId_year_month_type_key" ON "sales_targets"("userId", "year", "month", "type");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupeKey_key" ON "alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "alerts_resolvedAt_createdAt_idx" ON "alerts"("resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_type_createdAt_idx" ON "alerts"("type", "createdAt");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "attendances_sessionId_idx" ON "attendances"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gamification_profiles" ADD CONSTRAINT "gamification_profiles_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_rules" ADD CONSTRAINT "teacher_salary_rules_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_rules" ADD CONSTRAINT "teacher_salary_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_periods" ADD CONSTRAINT "teacher_salary_periods_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_payments" ADD CONSTRAINT "teacher_salary_payments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "teacher_salary_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_payments" ADD CONSTRAINT "teacher_salary_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_payments" ADD CONSTRAINT "teacher_salary_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "income_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_salaryPaymentId_fkey" FOREIGN KEY ("salaryPaymentId") REFERENCES "teacher_salary_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework" ADD CONSTRAINT "homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_progress_snapshots" ADD CONSTRAINT "student_progress_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

