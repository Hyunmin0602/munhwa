CREATE TABLE "ArchivePostCollaborator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchivePostCollaborator_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "ArchivePost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArchivePostCollaborator_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArchivePostCollaborator_postId_userId_key" ON "ArchivePostCollaborator"("postId", "userId");
CREATE INDEX "ArchivePostCollaborator_userId_createdAt_idx" ON "ArchivePostCollaborator"("userId", "createdAt");