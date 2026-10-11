import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

const require = createRequire(path.join(process.cwd(), "package.json"));
let userId: string | null = "manager";
let manager = true;
let reads = 0;
let listArgs: Prisma.ActivityLogFindManyArgs | undefined;
const log = { id: "log", spaceId: "culture-sports", type: "칸반", action: "수정", title: "업무", entityType: "TASK", entityId: "task", createdAt: new Date("2026-10-11T03:00:00Z"), project: null, actor: { id: "actor", name: "구성원", email: "actor@example.test" }, beforeData: '{"title":"before"}', afterData: '{"title":"after"}', metadata: '{"value":"details"}' };
const stubs: Record<string, unknown> = {
  "src/auth.ts": { auth: async () => userId ? { user: { id: userId } } : null },
  "src/lib/server-utils.ts": { DEFAULT_SPACE_ID: "culture-sports", assertSpaceManager: async () => manager },
  "src/lib/prisma.ts": { prisma: { activityLog: {
    findMany: async (args: Prisma.ActivityLogFindManyArgs) => { reads++; listArgs = args; return Array.from({ length: 31 }, (_, index) => ({ ...log, id: `log-${index}` })); },
    findFirst: async ({ where }: { where: { id?: string; spaceId?: string } }) => {
      reads++;
      const candidate = where.id === "other-space-log" ? { ...log, id: where.id, spaceId: "other-space" } : where.id === log.id ? log : null;
      return candidate && (!where.spaceId || where.spaceId === candidate.spaceId) ? candidate : null;
    },
  } } },
};
const originals = Object.entries(stubs).map(([relative, exports]) => {
  const filename = path.join(process.cwd(), relative);
  const original = require.cache[filename];
  const stub = new Module(filename);
  stub.exports = exports;
  stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const list = require(path.join(process.cwd(), "src/app/api/space-management/logs/route.ts")).GET as (request: NextRequest) => Promise<Response>;
const detail = require(path.join(process.cwd(), "src/app/api/space-management/logs/[logId]/route.ts")).GET as (request: Request, context: { params: Promise<{ logId: string }> }) => Promise<Response>;
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}

const request = (query = "") => new NextRequest(`http://localhost/api/space-management/logs?${query}`);
const readDetail = (logId: string) => detail(request(), { params: Promise.resolve({ logId }) });
beforeEach(() => { userId = "manager"; manager = true; reads = 0; listArgs = undefined; });

test("both log endpoints reject unauthenticated and non-manager users before querying logs", async () => {
  userId = null;
  assert.equal((await list(request())).status, 401);
  assert.equal((await readDetail("log")).status, 401);
  userId = "member"; manager = false;
  assert.equal((await list(request())).status, 403);
  assert.equal((await readDetail("log")).status, 403);
  assert.equal(reads, 0);
});

test("list returns 30 summaries and an opaque cursor without loading detail fields", async () => {
  const response = await list(request());
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.items.length, 30);
  assert.equal(typeof payload.nextCursor, "string");
  assert.notEqual(payload.nextCursor, "log-29");
  for (const field of ["beforeData", "afterData", "metadata"]) {
    assert.equal(field in payload.items[0], false);
    assert.equal(field in listArgs!.select!, false);
  }
  assert.equal(listArgs?.where?.spaceId, "culture-sports");
});

test("individual detail is restricted to the current Space even when a foreign log ID is known", async () => {
  const foreign = await readDetail("other-space-log");
  assert.equal(foreign.status, 404);
  assert.equal((await foreign.json()).error.code, "NOT_FOUND");
  const own = await readDetail("log");
  assert.equal(own.status, 200);
  assert.equal((await own.json()).beforeData, log.beforeData);
});

test("invalid list filters return a structured validation error without a database query", async () => {
  const response = await list(request("from=2026-02-30"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  assert.equal(reads, 0);
});
