CREATE TABLE "ArchiveImage" (
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
    CONSTRAINT "ArchiveImage_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "ArchivePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArchiveImage_uploaderId_fkey"
      FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArchiveImage_storageKey_key" ON "ArchiveImage"("storageKey");
CREATE INDEX "ArchiveImage_postId_idx" ON "ArchiveImage"("postId");
CREATE INDEX "ArchiveImage_uploaderId_createdAt_idx" ON "ArchiveImage"("uploaderId", "createdAt");
