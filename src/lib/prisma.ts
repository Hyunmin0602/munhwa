import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
  const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (!url) {
    if (process.env.NODE_ENV === "production" && !isProductionBuild) {
      throw new Error(
        "Missing database URL. Set DATABASE_URL or TURSO_DATABASE_URL so the app writes to the shared database."
      );
    }

    const localAdapter = new PrismaLibSql({ url: "file:prisma/dev.db" });
    const client = new PrismaClient({ adapter: localAdapter });
    client.$connect().catch(() => {});
    return client;
  }

  const adapter = new PrismaLibSql({ url, authToken });
  const client = new PrismaClient({ adapter });
  // Warm up the connection eagerly (reduces first-query latency)
  client.$connect().catch(() => {});
  return client;
}

// Reuse across hot reloads in dev AND across invocations in production
export const prisma = globalForPrisma.prisma ?? createPrisma();
globalForPrisma.prisma = prisma;
