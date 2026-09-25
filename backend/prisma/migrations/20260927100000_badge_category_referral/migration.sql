-- CreateEnum
CREATE TYPE "BadgeCategory" AS ENUM ('ATTENDANCE', 'ACADEMIC', 'ACTIVITY', 'SOCIAL', 'SPECIAL');

-- AlterEnum
ALTER TYPE "BadgeRule" ADD VALUE 'REFERRAL';

-- AlterTable
ALTER TABLE "badges" ADD COLUMN     "category" "BadgeCategory" NOT NULL DEFAULT 'SPECIAL';


-- Mavjud nishonlar qoidasiga qarab toifalanadi (faqat standart qiymatdagi yozuvlar; o'chirish yo'q)
UPDATE "badges" SET "category" = 'ATTENDANCE' WHERE "rule" IN ('STREAK_DAYS', 'ATTENDANCE_RATE') AND "category" = 'SPECIAL';
UPDATE "badges" SET "category" = 'ACADEMIC' WHERE "rule" IN ('HOMEWORK_COUNT', 'EXAM_SCORE', 'COURSE_COMPLETED') AND "category" = 'SPECIAL';
UPDATE "badges" SET "category" = 'ACTIVITY' WHERE "rule" = 'XP_TOTAL' AND "category" = 'SPECIAL';
