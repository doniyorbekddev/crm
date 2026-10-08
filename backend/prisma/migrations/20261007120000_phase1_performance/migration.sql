-- CRM 4.0, 1-faza (unumdorlik poydevori). Faqat qo'shimcha: mavjud jadval/ustun/ma'lumot o'zgarmaydi.

-- Sana bo'yicha (guruh/o'quvchisiz) davomat so'rovlari butun jadvalni o'qimasin
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- Eski bildirishnomalarni saqlash muddati bo'yicha tozalash
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- Sog'liq bali va xavf darajasining kunlik tarixi
CREATE TABLE "risk_snapshots" (
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "healthScore" SMALLINT,
    "riskLevel" "RiskLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_snapshots_pkey" PRIMARY KEY ("studentId","date")
);

CREATE INDEX "risk_snapshots_date_idx" ON "risk_snapshots"("date");

ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fon vazifasi ijarasi: bir vaqtda bitta jarayon
CREATE TABLE "job_leases" (
    "name" VARCHAR(60) NOT NULL,
    "owner" VARCHAR(80) NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("name")
);
