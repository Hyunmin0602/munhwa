-- Map each project-specific Kanban column to an optional status shown on the integrated board.
-- Existing columns intentionally remain unmapped until their project owner configures them.
ALTER TABLE "KanbanColumn" ADD COLUMN "integratedStatus" TEXT;
ALTER TABLE "KanbanColumn" ADD COLUMN "isIntegratedPrimary" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "KanbanColumn_projectId_integratedStatus_idx"
ON "KanbanColumn"("projectId", "integratedStatus");