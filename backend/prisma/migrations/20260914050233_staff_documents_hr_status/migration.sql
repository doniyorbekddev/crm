-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CONTRACT', 'PASSPORT', 'CERTIFICATE', 'RECEIPT', 'OTHER');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'DOCUMENT_EXPIRING';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "expiresAt" DATE,
ADD COLUMN     "teacherProfileId" TEXT,
ADD COLUMN     "title" VARCHAR(150);

-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "employmentStatus" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "terminationDate" DATE;

-- CreateIndex
CREATE INDEX "documents_teacherProfileId_idx" ON "documents"("teacherProfileId");

-- CreateIndex
CREATE INDEX "documents_employeeId_idx" ON "documents"("employeeId");

-- CreateIndex
CREATE INDEX "documents_expiresAt_idx" ON "documents"("expiresAt");

-- CreateIndex
CREATE INDEX "teacher_profiles_employmentStatus_idx" ON "teacher_profiles"("employmentStatus");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------
-- Ma'lumotlarni moslash (hech narsa o'chirilmaydi)
-- ---------------------------------------------------------------------
-- Mavjud xarajat va tushum hujjatlari — chek
UPDATE "documents" SET "category" = 'RECEIPT' WHERE "expenseId" IS NOT NULL OR "incomeId" IS NOT NULL;

-- Faolsiz o'qituvchilar ishdan ketgan holatga o'tadi (ketgan sana — oxirgi o'zgarish kuni)
UPDATE "teacher_profiles"
SET "employmentStatus" = 'RESIGNED', "terminationDate" = COALESCE("terminationDate", "updatedAt"::date)
WHERE "isActive" = false;

-- Hujjat endi o'qituvchi yoki xodimga ham tegishli bo'lishi mumkin — kamida bitta egasi shart
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_owner_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_owner_check"
  CHECK (num_nonnulls("leadId", "studentId", "expenseId", "incomeId", "teacherProfileId", "employeeId") >= 1);

-- Xodim hujjatlari (pasport nusxasi ham) — alohida ruxsat
INSERT INTO "permissions" ("id", "key", "module", "description")
VALUES
  ('perm_staff_document_view', 'staff_document.view', 'hr', 'O‘qituvchi va xodim hujjatlarini (shartnoma, pasport, sertifikat) ko‘rish va yuklab olish'),
  ('perm_staff_document_manage', 'staff_document.manage', 'hr', 'O‘qituvchi va xodim hujjatlarini yuklash, tahrirlash va o‘chirish')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "roles" AS r
CROSS JOIN "permissions" AS p
WHERE r."key" IN ('SUPER_ADMIN', 'OWNER', 'ADMIN') AND p."key" IN ('staff_document.view', 'staff_document.manage')
ON CONFLICT DO NOTHING;
