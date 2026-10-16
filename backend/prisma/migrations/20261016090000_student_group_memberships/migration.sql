-- CreateTable
CREATE TABLE "student_group_memberships" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "reason" VARCHAR(255),
    "leftReason" VARCHAR(255),
    "addedById" TEXT,
    "removedById" TEXT,

    CONSTRAINT "student_group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_group_memberships_studentId_leftAt_idx" ON "student_group_memberships"("studentId", "leftAt");

-- CreateIndex
CREATE INDEX "student_group_memberships_groupId_leftAt_idx" ON "student_group_memberships"("groupId", "leftAt");

-- AddForeignKey
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bitta guruhda faol a'zolik bittadan oshmaydi (parallel so'rovlar ham ikkinchisini yarata olmaydi)
CREATE UNIQUE INDEX "student_group_memberships_active_key" ON "student_group_memberships"("studentId", "groupId") WHERE "leftAt" IS NULL;
-- Chiqish sanasi qo'shilish sanasidan oldin bo'lmaydi
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_left_after_joined" CHECK ("leftAt" IS NULL OR "leftAt" >= "joinedAt");
