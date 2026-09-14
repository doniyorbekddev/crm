-- CreateTable
CREATE TABLE "student_group_changes" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromGroupId" TEXT,
    "toGroupId" TEXT,
    "fromGroupName" VARCHAR(100),
    "toGroupName" VARCHAR(100),
    "reason" VARCHAR(255),
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_group_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_group_changes_studentId_changedAt_idx" ON "student_group_changes"("studentId", "changedAt");

-- CreateIndex
CREATE INDEX "student_group_changes_fromGroupId_changedAt_idx" ON "student_group_changes"("fromGroupId", "changedAt");

-- CreateIndex
CREATE INDEX "student_group_changes_toGroupId_changedAt_idx" ON "student_group_changes"("toGroupId", "changedAt");

-- CreateIndex
CREATE INDEX "student_group_changes_changedAt_idx" ON "student_group_changes"("changedAt");

-- AddForeignKey
ALTER TABLE "student_group_changes" ADD CONSTRAINT "student_group_changes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_changes" ADD CONSTRAINT "student_group_changes_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_changes" ADD CONSTRAINT "student_group_changes_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_changes" ADD CONSTRAINT "student_group_changes_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Guruhni o'zgartirmaydigan yozuv bo'lmasin
ALTER TABLE "student_group_changes" ADD CONSTRAINT "student_group_changes_changed_check"
  CHECK ("fromGroupId" IS DISTINCT FROM "toGroupId" OR "fromGroupId" IS NULL);

-- Mavjud o'quvchilarning hozirgi guruhi tarixning boshlang'ich yozuvi sifatida (hech narsa o'chirilmaydi)
INSERT INTO "student_group_changes" ("id", "studentId", "toGroupId", "toGroupName", "reason", "changedById", "changedAt")
SELECT 'sgc' || md5(s."id"), s."id", s."groupId", g."name", 'Tarix yuritilishidan oldingi guruh', s."createdById", s."createdAt"
FROM "students" s
JOIN "groups" g ON g."id" = s."groupId"
ON CONFLICT ("id") DO NOTHING;
