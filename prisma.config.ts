import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });
config({ path: ".env" });

const datasourceUrl = process.env.TURSO_DATABASE_URL;

if (!datasourceUrl || !process.env.TURSO_AUTH_TOKEN || (!datasourceUrl.startsWith("libsql://") && !datasourceUrl.startsWith("https://"))) {
  throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must point to the shared external database.");
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
