-- CreateEnum
CREATE TYPE "CodeRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- AlterTable
ALTER TABLE "homework" ADD COLUMN     "codeLanguage" VARCHAR(20),
ADD COLUMN     "codeTests" JSONB;

-- CreateTable
CREATE TABLE "code_runs" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "language" VARCHAR(20) NOT NULL,
    "status" "CodeRunStatus" NOT NULL DEFAULT 'QUEUED',
    "passed" SMALLINT,
    "total" SMALLINT,
    "result" JSONB,
    "error" VARCHAR(500),
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "code_runs_status_nextAttemptAt_idx" ON "code_runs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "code_runs_submissionId_createdAt_idx" ON "code_runs"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "code_runs" ADD CONSTRAINT "code_runs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "homework_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

