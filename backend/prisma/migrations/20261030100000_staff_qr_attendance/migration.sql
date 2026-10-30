-- Xodim davomati (QR). Faqat yangi jadvallar va NotificationType'ga yangi qiymat — mavjud jadval va ma'lumotlar o'zgarmaydi.
-- Orqaga qaytarish: yangi jadvallar boshqa jadvallarga bog'lanmagan (faqat ular users'ga ishora qiladi), ilova eski versiyaga qaytsa ham ishlayveradi.

-- CreateEnum
CREATE TYPE "StaffScheduleMode" AS ENUM ('FIXED', 'LESSONS');

-- CreateEnum
CREATE TYPE "StaffAttendanceEventType" AS ENUM ('CHECK_IN', 'BREAK_START', 'BREAK_END', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "StaffAttendanceEventSource" AS ENUM ('QR', 'CORRECTION');

-- CreateEnum
CREATE TYPE "StaffWorkPhase" AS ENUM ('WORKING', 'ON_BREAK', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "StaffScheduleExceptionType" AS ENUM ('DAY_OFF', 'CUSTOM_HOURS');

-- CreateEnum
CREATE TYPE "StaffPermissionType" AS ENUM ('ABSENCE', 'LATE_ARRIVAL', 'EARLY_LEAVE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STAFF_ATTENDANCE';

-- CreateTable
CREATE TABLE "staff_work_schedules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "StaffScheduleMode" NOT NULL DEFAULT 'FIXED',
    "workDays" "WeekDay"[],
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "breakMinutes" SMALLINT NOT NULL DEFAULT 0,
    "graceMinutes" SMALLINT NOT NULL DEFAULT 10,
    "absentAfterMinutes" SMALLINT NOT NULL DEFAULT 120,
    "lessonLeadMinutes" SMALLINT NOT NULL DEFAULT 15,
    "effectiveFrom" DATE NOT NULL,
    "note" VARCHAR(255),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedule_exceptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "StaffScheduleExceptionType" NOT NULL,
    "startTime" VARCHAR(5),
    "endTime" VARCHAR(5),
    "reason" VARCHAR(255) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "phase" "StaffWorkPhase",
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "breakSeconds" INTEGER NOT NULL DEFAULT 0,
    "breakStartedAt" TIMESTAMP(3),
    "lateNotifiedAt" TIMESTAMP(3),
    "missingCheckoutNotifiedAt" TIMESTAMP(3),
    "absenceNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_events" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffAttendanceEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" "StaffAttendanceEventSource" NOT NULL,
    "qrTokenId" TEXT,
    "correctionId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidedByCorrectionId" TEXT,
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_corrections" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "createdById" TEXT,
    "reason" VARCHAR(255) NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_qr_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "branchId" TEXT NOT NULL DEFAULT 'branch_main',
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_permission_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffPermissionType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "time" VARCHAR(5),
    "reason" VARCHAR(255) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_permission_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_work_schedules_userId_effectiveFrom_key" ON "staff_work_schedules"("userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "staff_holidays_date_key" ON "staff_holidays"("date");

-- CreateIndex
CREATE INDEX "staff_schedule_exceptions_date_idx" ON "staff_schedule_exceptions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedule_exceptions_userId_date_key" ON "staff_schedule_exceptions"("userId", "date");

-- CreateIndex
CREATE INDEX "staff_attendance_days_date_idx" ON "staff_attendance_days"("date");

-- CreateIndex
CREATE INDEX "staff_attendance_days_phase_idx" ON "staff_attendance_days"("phase");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_days_userId_date_key" ON "staff_attendance_days"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_events_qrTokenId_key" ON "staff_attendance_events"("qrTokenId");

-- CreateIndex
CREATE INDEX "staff_attendance_events_dayId_occurredAt_idx" ON "staff_attendance_events"("dayId", "occurredAt");

-- CreateIndex
CREATE INDEX "staff_attendance_events_userId_occurredAt_idx" ON "staff_attendance_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "staff_attendance_corrections_dayId_createdAt_idx" ON "staff_attendance_corrections"("dayId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_qr_tokens_tokenHash_key" ON "staff_qr_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "staff_qr_tokens_expiresAt_idx" ON "staff_qr_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "staff_permission_requests_userId_startDate_idx" ON "staff_permission_requests"("userId", "startDate");

-- CreateIndex
CREATE INDEX "staff_permission_requests_status_startDate_idx" ON "staff_permission_requests"("status", "startDate");

-- AddForeignKey
ALTER TABLE "staff_work_schedules" ADD CONSTRAINT "staff_work_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedule_exceptions" ADD CONSTRAINT "staff_schedule_exceptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_days" ADD CONSTRAINT "staff_attendance_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "staff_attendance_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_qrTokenId_fkey" FOREIGN KEY ("qrTokenId") REFERENCES "staff_qr_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "staff_attendance_corrections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_corrections" ADD CONSTRAINT "staff_attendance_corrections_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "staff_attendance_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_corrections" ADD CONSTRAINT "staff_attendance_corrections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permission_requests" ADD CONSTRAINT "staff_permission_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permission_requests" ADD CONSTRAINT "staff_permission_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Bir kunda faqat bitta amaldagi "keldi" va bitta "ketdi" (bir vaqtdagi so'rovlarga qarshi baza darajasidagi himoya)
CREATE UNIQUE INDEX "staff_attendance_events_one_in_out" ON "staff_attendance_events" ("dayId", "type") WHERE "type" IN ('CHECK_IN', 'CHECK_OUT') AND "voidedAt" IS NULL;
