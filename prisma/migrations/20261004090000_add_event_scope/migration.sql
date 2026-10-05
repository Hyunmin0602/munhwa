PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "Event_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "type" TEXT NOT NULL DEFAULT 'BUSINESS',
    "scope" TEXT NOT NULL DEFAULT 'PROJECT',
    "spaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "creatorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_new_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_new_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Event_new_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "Event_new" ("id", "title", "description", "startDate", "endDate", "allDay", "color", "type", "scope", "spaceId", "projectId", "creatorId", "createdAt", "updatedAt")
SELECT e."id", e."title", e."description", e."startDate", e."endDate", e."allDay", e."color", 'BUSINESS', 'PROJECT', p."spaceId", e."projectId", e."creatorId", e."createdAt", e."updatedAt"
FROM "Event" e JOIN "Project" p ON p."id" = e."projectId";

DROP TABLE "Event";
ALTER TABLE "Event_new" RENAME TO "Event";
CREATE INDEX "Event_spaceId_startDate_idx" ON "Event"("spaceId", "startDate");
CREATE INDEX "Event_projectId_startDate_idx" ON "Event"("projectId", "startDate");
CREATE INDEX "Event_creatorId_startDate_idx" ON "Event"("creatorId", "startDate");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;