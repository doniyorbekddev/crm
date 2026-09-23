-- =====================================================================
-- Kabinet (portal) hisoblari — PHASE 3
--
-- students.userId va parents.userId — o'quvchi/ota-onaning kirish hisobi.
-- Ikkalasi ham NULL bo'lishi mumkin: kabinet ochilmagan bo'lsa bo'sh qoladi.
-- Hisob o'chirilsa bog'lanish uziladi (SET NULL), o'quvchi yozuvi qoladi.
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- AlterTable
ALTER TABLE "parents" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "parents_userId_key" ON "parents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

