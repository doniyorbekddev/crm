-- PHASE 10: AI biznes yordamchisi.
--
-- `ai_queries` — savol, unga javob bergan "tool" va ko'rsatilgan javob. AI bazaga to'g'ridan-to'g'ri
-- SQL yubormaydi: faqat oldindan yozilgan, ruxsat tekshiriladigan so'rovlar (tool) ishlatiladi,
-- shuning uchun bu jadval nima so'ralgani va nima ko'rsatilganini kuzatish uchun xizmat qiladi.
--
-- Mavjud ma'lumotga ta'sir qilmaydi: faqat yangi jadval.

-- CreateTable
CREATE TABLE "ai_queries" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "question" VARCHAR(500) NOT NULL,
    "toolKey" VARCHAR(50),
    "params" JSONB,
    "answer" VARCHAR(1000),
    "failure" VARCHAR(255),
    "durationMs" SMALLINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_queries_userId_createdAt_idx" ON "ai_queries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_queries_toolKey_createdAt_idx" ON "ai_queries"("toolKey", "createdAt");

-- CreateIndex
CREATE INDEX "ai_queries_createdAt_idx" ON "ai_queries"("createdAt");

-- AddForeignKey
ALTER TABLE "ai_queries" ADD CONSTRAINT "ai_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

