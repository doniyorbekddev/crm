-- =====================================================================
-- Sertifikatlar — PHASE 6 (3-qism)
--
-- Ism, kurs va o'qituvchi nomi nusxa (snapshot) sifatida saqlanadi: berilgan
-- sertifikat keyingi tahrirlardan mustaqil bo'ladi (bu hujjat, jonli ma'lumot emas).
-- `verifyToken` — ochiq tekshiruv uchun taxmin qilib bo'lmaydigan kalit.
--
-- Bu migratsiya hech narsani o'chirmaydi: DROP / TRUNCATE / DELETE yo'q.
-- =====================================================================

-- CreateTable
CREATE TABLE "certificates" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "verifyToken" VARCHAR(64) NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT,
    "groupId" TEXT,
    "studentName" VARCHAR(200) NOT NULL,
    "courseName" VARCHAR(150) NOT NULL,
    "teacherName" VARCHAR(200),
    "branchName" VARCHAR(100),
    "startDate" DATE NOT NULL,
    "completionDate" DATE NOT NULL,
    "percentage" SMALLINT,
    "grade" VARCHAR(4),
    "note" VARCHAR(500),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_number_key" ON "certificates"("number");

-- CreateIndex
CREATE UNIQUE INDEX "certificates_verifyToken_key" ON "certificates"("verifyToken");

-- CreateIndex
CREATE INDEX "certificates_studentId_issuedAt_idx" ON "certificates"("studentId", "issuedAt");

-- CreateIndex
CREATE INDEX "certificates_courseId_idx" ON "certificates"("courseId");

-- CreateIndex
CREATE INDEX "certificates_issuedAt_idx" ON "certificates"("issuedAt");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

