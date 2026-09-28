-- CreateTable
CREATE TABLE "pending_uploads" (
    "path" VARCHAR(255) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_uploads_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE INDEX "pending_uploads_createdAt_idx" ON "pending_uploads"("createdAt");

