CREATE TABLE "SpaceAdminTransferLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT NOT NULL,
    "previousAdminUserId" TEXT NOT NULL,
    "nextAdminUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpaceAdminTransferLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpaceAdminTransferLog_previousAdminUserId_fkey"
      FOREIGN KEY ("previousAdminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpaceAdminTransferLog_nextAdminUserId_fkey"
      FOREIGN KEY ("nextAdminUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SpaceAdminTransferLog_createdAt_idx" ON "SpaceAdminTransferLog"("createdAt");
CREATE INDEX "SpaceAdminTransferLog_previousAdminUserId_idx" ON "SpaceAdminTransferLog"("previousAdminUserId");
CREATE INDEX "SpaceAdminTransferLog_nextAdminUserId_idx" ON "SpaceAdminTransferLog"("nextAdminUserId");
