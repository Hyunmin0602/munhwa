import { defineConfig } from "prisma/config";

const isProd = !!process.env.TURSO_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: isProd ? process.env.TURSO_DATABASE_URL! : "file:./prisma/dev.db",
  },
});
