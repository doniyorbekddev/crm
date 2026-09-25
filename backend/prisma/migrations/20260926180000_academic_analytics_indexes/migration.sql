-- CreateIndex
CREATE INDEX "homework_submissions_homeworkId_status_idx" ON "homework_submissions"("homeworkId", "status");

-- CreateIndex
CREATE INDEX "topic_mastery_topicId_score_idx" ON "topic_mastery"("topicId", "score");

