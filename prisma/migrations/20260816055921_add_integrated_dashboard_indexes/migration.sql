-- CreateIndex
CREATE INDEX "ArchivePost_projectId_kind_updatedAt_idx" ON "ArchivePost"("projectId", "kind", "updatedAt");

-- CreateIndex
CREATE INDEX "ArchivePost_authorId_visibility_idx" ON "ArchivePost"("authorId", "visibility");

-- CreateIndex
CREATE INDEX "Event_projectId_startDate_idx" ON "Event"("projectId", "startDate");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
