import { defineConfig } from "prisma/config";

const datasourceUrl =
  process.env.TURSO_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "file:./prisma/dev.db";

export default defineConfig({
  datasource: {
    url: datasourceUrl,
  },
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
