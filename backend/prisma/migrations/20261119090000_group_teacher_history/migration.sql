-- Guruh o'qituvchisi tarixi (faqat qo'shuvchi): o'tgan oy hisobotlari o'sha davr o'qituvchisini oladi.
-- Mavjud jadvallarga tegilmaydi; har guruhning hozirgi o'qituvchisi boshlang'ich (ochiq) yozuv sifatida qo'shiladi.
-- Bungacha bo'lgan almashinuvlar saqlanmagan (audit yozuvida eski/yangi o'qituvchi yo'q) — tarix shu migratsiyadan boshlanadi.

-- CreateTable
CREATE TABLE "group_teacher_history" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teacherId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_teacher_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_teacher_history_groupId_startedAt_idx" ON "group_teacher_history"("groupId", "startedAt");

-- CreateIndex
CREATE INDEX "group_teacher_history_teacherId_startedAt_idx" ON "group_teacher_history"("teacherId", "startedAt");

-- AddForeignKey
ALTER TABLE "group_teacher_history" ADD CONSTRAINT "group_teacher_history_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teacher_history" ADD CONSTRAINT "group_teacher_history_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_teacher_history" ADD CONSTRAINT "group_teacher_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: hozirgi o'qituvchi guruh boshlangan kundan (yoki CRMga kiritilgan vaqtdan, qaysi biri oldin bo'lsa) beri
INSERT INTO "group_teacher_history" ("id", "groupId", "teacherId", "startedAt", "endedAt", "changedById", "createdAt")
SELECT gen_random_uuid()::text, g."id", g."teacherId", LEAST(g."startDate"::timestamp, g."createdAt"), NULL, NULL, CURRENT_TIMESTAMP
FROM "groups" g
WHERE g."teacherId" IS NOT NULL;
