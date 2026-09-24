-- Telegram bot PHASE 3: o'quvchi vazifani o'zi topshira oladi.
--
-- Avval topshiriq faqat o'qituvchi tomonidan baholanardi; o'quvchi javob yozadigan joy
-- yo'q edi. `answerText` — matnli javob (fayl uchun `attachmentPath` allaqachon bor).
-- Ustun ixtiyoriy, mavjud yozuvlar o'zgarmaydi.

-- AlterTable
ALTER TABLE "homework_submissions" ADD COLUMN     "answerText" VARCHAR(2000);

