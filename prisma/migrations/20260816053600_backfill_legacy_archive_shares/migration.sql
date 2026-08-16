UPDATE "ArchivePost"
SET
  "visibility" = 'EXTERNAL',
  "shareToken" = "slug",
  "shareEnabled" = true
WHERE "published" = true;