ALTER TABLE "User" ADD COLUMN "registrationStatus" TEXT NOT NULL DEFAULT 'APPROVED';
CREATE INDEX "User_registrationStatus_createdAt_idx" ON "User"("registrationStatus", "createdAt");
