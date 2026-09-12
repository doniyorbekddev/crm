-- CreateIndex
CREATE INDEX "attendances_studentId_date_idx" ON "attendances"("studentId", "date");

-- CreateIndex
CREATE INDEX "leads_assignedToId_createdAt_idx" ON "leads"("assignedToId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_status_convertedAt_idx" ON "leads"("status", "convertedAt");

-- CreateIndex
CREATE INDEX "payments_studentId_deletedAt_idx" ON "payments"("studentId", "deletedAt");

-- CreateIndex
CREATE INDEX "payments_method_paidAt_idx" ON "payments"("method", "paidAt");

-- CreateIndex
CREATE INDEX "students_groupId_status_deletedAt_idx" ON "students"("groupId", "status", "deletedAt");
