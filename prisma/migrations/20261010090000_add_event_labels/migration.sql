-- CreateTable
CREATE TABLE "EventLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventLabel_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EventLabel_nameKey_key" ON "EventLabel"("nameKey");

-- CreateIndex
CREATE INDEX "EventLabel_createdBy_createdAt_idx" ON "EventLabel"("createdBy", "createdAt");

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "labelId" TEXT REFERENCES "EventLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Event_labelId_idx" ON "Event"("labelId");