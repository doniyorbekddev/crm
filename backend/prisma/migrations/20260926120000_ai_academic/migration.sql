-- CreateEnum
CREATE TYPE "AiAnalysisKind" AS ENUM ('STUDENT', 'GROUP', 'HOMEWORK_REVIEW', 'PARENT_SUMMARY', 'REMEDIAL');

-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('READY', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiAnalysisSource" AS ENUM ('RULES', 'LLM');

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "kind" "AiAnalysisKind" NOT NULL,
    "subjectType" VARCHAR(20) NOT NULL,
    "subjectId" VARCHAR(50) NOT NULL,
    "periodKey" VARCHAR(20),
    "status" "AiAnalysisStatus" NOT NULL DEFAULT 'READY',
    "source" "AiAnalysisSource" NOT NULL DEFAULT 'RULES',
    "summary" VARCHAR(2000) NOT NULL,
    "result" JSONB NOT NULL,
    "model" VARCHAR(60),
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyses_kind_subjectType_subjectId_createdAt_idx" ON "ai_analyses"("kind", "subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_analyses_kind_periodKey_idx" ON "ai_analyses"("kind", "periodKey");

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

