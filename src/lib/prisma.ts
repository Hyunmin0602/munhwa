import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrisma() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken || (!url.startsWith("libsql://") && !url.startsWith("https://"))) {
    throw new Error(
      "Missing Turso configuration. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for the shared database."
    );
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
