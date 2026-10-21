-- PMT: qo'shimcha guruh o'qituvchisi ulushi. Faqat qo'shimcha — standart 0, mavjud hisob-kitob o'zgarmaydi.
ALTER TABLE "student_group_memberships" ADD COLUMN "commissionShare" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "student_group_memberships" ADD CONSTRAINT "student_group_memberships_commission_share_range" CHECK ("commissionShare" >= 0 AND "commissionShare" <= 100);

-- To'lov paytida qotirilgan bo'linish
CREATE TABLE "payment_teacher_shares" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT,
    "sharePercent" DECIMAL(5,2) NOT NULL,
    "baseAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_teacher_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_teacher_shares_share_range" CHECK ("sharePercent" > 0 AND "sharePercent" <= 100),
    CONSTRAINT "payment_teacher_shares_base_nonnegative" CHECK ("baseAmount" >= 0)
);

CREATE UNIQUE INDEX "payment_teacher_shares_paymentId_teacherId_key" ON "payment_teacher_shares"("paymentId", "teacherId");
CREATE INDEX "payment_teacher_shares_teacherId_idx" ON "payment_teacher_shares"("teacherId");

ALTER TABLE "payment_teacher_shares" ADD CONSTRAINT "payment_teacher_shares_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_teacher_shares" ADD CONSTRAINT "payment_teacher_shares_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_teacher_shares" ADD CONSTRAINT "payment_teacher_shares_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
