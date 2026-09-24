import { config } from "dotenv";
import { createClient } from "@libsql/client";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken || (!url.startsWith("libsql://") && !url.startsWith("https://"))) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
}

const db = createClient({ url, authToken });

async function main() {
const migrationTable = await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'");
if (migrationTable.rows.length > 0) {
  throw new Error("Migration history already exists. This one-time baseline script will not run again.");
}

await db.batch([
  `CREATE TABLE IF NOT EXISTS "ArchiveImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("postId") REFERENCES "ArchivePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ArchiveImage_storageKey_key" ON "ArchiveImage"("storageKey")`,
  `CREATE INDEX IF NOT EXISTS "ArchiveImage_postId_idx" ON "ArchiveImage"("postId")`,
  `CREATE INDEX IF NOT EXISTS "ArchiveImage_uploaderId_createdAt_idx" ON "ArchiveImage"("uploaderId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "adminUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("adminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Space_adminUserId_idx" ON "Space"("adminUserId")`,
  `CREATE TABLE IF NOT EXISTS "SpaceAdministration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceAdminUserId" TEXT NOT NULL UNIQUE,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("spaceAdminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "SpaceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "SpaceMember_userId_role_idx" ON "SpaceMember"("userId", "role")`,
  `CREATE TABLE IF NOT EXISTS "SpaceAdminTransferLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "previousAdminUserId" TEXT NOT NULL,
    "nextAdminUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("previousAdminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("nextAdminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "SpaceAdminTransferLog_createdAt_idx" ON "SpaceAdminTransferLog"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "SpaceAdminTransferLog_spaceId_createdAt_idx" ON "SpaceAdminTransferLog"("spaceId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT NOT NULL,
    "spaceId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "beforeData" TEXT,
    "afterData" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_spaceId_createdAt_idx" ON "AdminAuditLog"("spaceId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_createdAt_idx" ON "AdminAuditLog"("actorUserId", "createdAt")`,
], "write");

const projectColumns = await db.execute("PRAGMA table_info(\"Project\")");
const projectColumnNames = new Set(projectColumns.rows.map((row) => String(row.name)));
if (!projectColumnNames.has("spaceId")) await db.execute(`ALTER TABLE "Project" ADD COLUMN "spaceId" TEXT`);
if (!projectColumnNames.has("ownerId")) await db.execute(`ALTER TABLE "Project" ADD COLUMN "ownerId" TEXT`);
await db.execute(`CREATE INDEX IF NOT EXISTS "Project_spaceId_updatedAt_idx" ON "Project"("spaceId", "updatedAt")`);
await db.execute(`CREATE INDEX IF NOT EXISTS "Project_ownerId_idx" ON "Project"("ownerId")`);

await db.batch([
  `INSERT OR IGNORE INTO "Space" ("id", "name", "slug", "adminUserId")
   SELECT 'culture-sports', '문화체육위원회', 'culture-sports',
     COALESCE((SELECT "id" FROM "User" WHERE "role" = 'admin' ORDER BY "createdAt" ASC LIMIT 1),
              (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1))`,
  `UPDATE "Project" SET "spaceId" = 'culture-sports' WHERE "spaceId" IS NULL`,
  `UPDATE "Project" SET "ownerId" = (
     SELECT "userId" FROM "ProjectMember"
     WHERE "ProjectMember"."projectId" = "Project"."id" AND "ProjectMember"."role" = 'owner'
     ORDER BY "joinedAt" ASC LIMIT 1
   ) WHERE "ownerId" IS NULL`,
  `INSERT OR IGNORE INTO "SpaceAdministration" ("id", "spaceAdminUserId")
   SELECT 'culture-sports', "adminUserId" FROM "Space" WHERE "id" = 'culture-sports'`,
  `INSERT OR IGNORE INTO "SpaceMember" ("id", "spaceId", "userId", "role", "joinedAt")
   SELECT lower(hex(randomblob(16))), 'culture-sports', "userId",
     CASE WHEN "role" = 'owner' THEN 'admin' ELSE 'member' END, MIN("joinedAt")
   FROM "ProjectMember" GROUP BY "userId"`,
  `INSERT OR IGNORE INTO "SpaceMember" ("id", "spaceId", "userId", "role")
   SELECT lower(hex(randomblob(16))), 'culture-sports', "adminUserId", 'admin'
   FROM "Space" WHERE "id" = 'culture-sports'`,
], "write");

await db.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`);

const migrationsPath = join(process.cwd(), "prisma", "migrations");
const migrations = readdirSync(migrationsPath)
  .filter((name) => name !== "migration_lock.toml")
  .sort();
for (const migrationName of migrations) {
  const sql = readFileSync(join(migrationsPath, migrationName, "migration.sql"));
  const checksum = createHash("sha256").update(sql).digest("hex");
  await db.execute({
    sql: `INSERT OR IGNORE INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP, 1)`,
    args: [randomId(), checksum, migrationName],
  });
}

const counts = await db.execute(`SELECT
  (SELECT COUNT(*) FROM "Space") AS spaces,
  (SELECT COUNT(*) FROM "SpaceMember") AS space_members,
  (SELECT COUNT(*) FROM "Project" WHERE "spaceId" IS NOT NULL) AS scoped_projects,
  (SELECT COUNT(*) FROM "Project" WHERE "ownerId" IS NOT NULL) AS owned_projects,
  (SELECT COUNT(*) FROM "_prisma_migrations") AS migrations`);
console.log(JSON.stringify(counts.rows[0]));
}

function randomId() {
  return randomUUID();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
