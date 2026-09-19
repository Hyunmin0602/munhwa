import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL or TURSO_DATABASE_URL must point to the shared external database.");
}

export default defineConfig({
  datasource: {
    url: datasourceUrl,
  },
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
});
