-- Introduce organization-level scope without removing the legacy space administration tables.
CREATE TABLE "Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Space_adminUserId_fkey"
      FOREIGN KEY ("adminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");
CREATE INDEX "Space_adminUserId_idx" ON "Space"("adminUserId");

-- Keep the current deployment inside the first Space during the transition.
INSERT INTO "Space" ("id", "name", "slug", "adminUserId", "createdAt", "updatedAt")
SELECT
  'culture-sports',
  '문화체육위원회',
  'culture-sports',
  COALESCE(
    (SELECT "spaceAdminUserId" FROM "SpaceAdministration" WHERE "id" = 'culture-sports' LIMIT 1),
    (SELECT "id" FROM "User" WHERE "role" IN ('space_admin', 'admin') ORDER BY "createdAt" ASC LIMIT 1),
    (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1)
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Space" WHERE "id" = 'culture-sports');

CREATE TABLE "SpaceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpaceMember_spaceId_fkey"
      FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SpaceMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");
CREATE INDEX "SpaceMember_userId_role_idx" ON "SpaceMember"("userId", "role");

ALTER TABLE "Project" ADD COLUMN "spaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT;

UPDATE "Project"
SET "spaceId" = 'culture-sports'
WHERE "spaceId" IS NULL;

UPDATE "Project"
SET "ownerId" = (
  SELECT "userId"
  FROM "ProjectMember"
  WHERE "ProjectMember"."projectId" = "Project"."id"
    AND "ProjectMember"."role" = 'owner'
  ORDER BY "joinedAt" ASC
  LIMIT 1
)
WHERE "ownerId" IS NULL;

INSERT INTO "SpaceMember" ("id", "spaceId", "userId", "role", "joinedAt")
SELECT
  lower(hex(randomblob(16))),
  'culture-sports',
  "ProjectMember"."userId",
  CASE WHEN "ProjectMember"."role" = 'owner' THEN 'admin' ELSE 'member' END,
  MIN("ProjectMember"."joinedAt")
FROM "ProjectMember"
JOIN "Project" ON "Project"."id" = "ProjectMember"."projectId"
WHERE "Project"."spaceId" = 'culture-sports'
GROUP BY "ProjectMember"."userId";

INSERT OR IGNORE INTO "SpaceMember" ("id", "spaceId", "userId", "role", "joinedAt")
SELECT lower(hex(randomblob(16))), 'culture-sports', "adminUserId", 'admin', CURRENT_TIMESTAMP
FROM "Space"
WHERE "id" = 'culture-sports';

CREATE INDEX "Project_spaceId_updatedAt_idx" ON "Project"("spaceId", "updatedAt");
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");
