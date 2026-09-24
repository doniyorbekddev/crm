-- Telegram bot PHASE 8: o'quvchi/ota-ona uchun yangi bildirishnoma turlari.
--
-- Vazifa e'lon qilindi / baholandi, imtihon natijasi, yangi daraja, sertifikat.
-- Faqat enum kengaytiriladi; mavjud yozuvlar o'zgarmaydi.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'HOMEWORK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'HOMEWORK_GRADED';
ALTER TYPE "NotificationType" ADD VALUE 'EXAM_RESULT';
ALTER TYPE "NotificationType" ADD VALUE 'LEVEL_UP';
ALTER TYPE "NotificationType" ADD VALUE 'CERTIFICATE_ISSUED';

