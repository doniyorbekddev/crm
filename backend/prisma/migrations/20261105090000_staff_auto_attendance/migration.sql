-- Xodim davomatini jadval bo'yicha avtomatik belgilash (additive): yangi hodisa manbasi va jadval belgisi.
-- Mavjud jadvallar va hodisalarga tegilmaydi (autoMark = false).

-- AlterEnum
ALTER TYPE "StaffAttendanceEventSource" ADD VALUE 'AUTO';

-- AlterTable
ALTER TABLE "staff_work_schedules" ADD COLUMN "autoMark" BOOLEAN NOT NULL DEFAULT false;
