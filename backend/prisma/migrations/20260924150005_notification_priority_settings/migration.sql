-- PHASE 14 (6-qism): bildirishnoma muhimligi va shaxsiy sozlamalar.
--
-- `notifications.priority` — turga qarab serverda qo'yiladi (chaqiruvchi yozmaydi),
-- shuning uchun eski yozuvlar ham shu jadval bo'yicha to'ldiriladi.
--
-- `notification_settings` — xodim qaysi turni ilovada va Telegramda olishini o'zi tanlaydi.
-- Jadval **bo'sh boshlanadi**: qator yo'q bo'lsa ikkala kanal ham yoqilgan hisoblanadi,
-- ya'ni hech kim hech qanday xabardan ayrilib qolmaydi va migratsiya ma'lumot yozmaydi.

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "notification_settings" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "telegram" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("userId","type")
);

-- CreateIndex
CREATE INDEX "notifications_userId_priority_readAt_idx" ON "notifications"("userId", "priority", "readAt");

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===== Eski yozuvlarga muhimlik darajasi =====
-- Yangi ustun DEFAULT 'NORMAL' bilan qo'shildi; quyida faqat NORMAL bo'lmaganlari to'g'rilanadi.
-- Hech qanday qator o'chirilmaydi yoki boshqa ustuni o'zgartirilmaydi.
UPDATE "notifications" SET "priority" = 'HIGH'
 WHERE "type" IN ('FOLLOW_UP_OVERDUE', 'DEBT_REMINDER', 'EXPENSE_APPROVAL', 'NEGATIVE_FEEDBACK', 'CHILD_ABSENT', 'SYSTEM');

UPDATE "notifications" SET "priority" = 'LOW'
 WHERE "type" = 'DAILY_DIGEST';
