ALTER TABLE "SpaceAdminTransferLog" ADD COLUMN "spaceId" TEXT;

UPDATE "SpaceAdminTransferLog"
SET "spaceId" = 'culture-sports'
WHERE "spaceId" IS NULL;

CREATE INDEX "SpaceAdminTransferLog_spaceId_createdAt_idx"
ON "SpaceAdminTransferLog"("spaceId", "createdAt");