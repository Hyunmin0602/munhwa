-- 문화체육위원회 공간의 관리자 지정은 단일 행으로 관리한다.
CREATE TABLE "SpaceAdministration" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'culture-sports' CHECK ("id" = 'culture-sports'),
    "spaceAdminUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpaceAdministration_spaceAdminUserId_fkey"
      FOREIGN KEY ("spaceAdminUserId") REFERENCES "User" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SpaceAdministration_spaceAdminUserId_key"
ON "SpaceAdministration"("spaceAdminUserId");

-- 지정된 계정이 이미 가입되어 있을 때에만 초기 space_admin으로 등록한다.
UPDATE "User"
SET "role" = 'space_admin'
WHERE "email" = 'finerel5955@gmail.com';

INSERT INTO "SpaceAdministration" ("id", "spaceAdminUserId", "createdAt", "updatedAt")
SELECT 'culture-sports', "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User"
WHERE "email" = 'finerel5955@gmail.com';
