-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ArchivePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "shareToken" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArchivePost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArchivePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ArchivePost" ("authorId", "content", "createdAt", "id", "projectId", "published", "publishedAt", "slug", "title", "updatedAt", "visibility") SELECT "authorId", "content", "createdAt", "id", "projectId", "published", "publishedAt", "slug", "title", "updatedAt", "visibility" FROM "ArchivePost";
DROP TABLE "ArchivePost";
ALTER TABLE "new_ArchivePost" RENAME TO "ArchivePost";
CREATE UNIQUE INDEX "ArchivePost_slug_key" ON "ArchivePost"("slug");
CREATE UNIQUE INDEX "ArchivePost_shareToken_key" ON "ArchivePost"("shareToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
