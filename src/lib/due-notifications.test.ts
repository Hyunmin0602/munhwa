import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { beforeEach, after } from "node:test";
import { NextRequest } from "next/server";

const require = createRequire(path.join(process.cwd(), "package.json"));
const dueDate = new Date("2020-01-01T00:00:00Z");
const tasks = Array.from({ length: 501 }, (_, index) => ({ id: `task-${String(index).padStart(3, "0")}`, title: "업무", dueDate, assigneeId: "recipient", column: { integratedStatus: "IN_PROGRESS", project: { id: "project", name: "사업" } } }));
let calls: Array<{ where: Record<string, unknown>; take: number }> = [];
let sent: Array<{ recipientId: string; dedupeKey: string }> = [];
let legacyRecipient: string | null = null;
let alreadyDelivered = false;
const originalSecret = process.env.CRON_SECRET;
process.env.CRON_SECRET = "test-only-cron-secret";
after(() => { if (originalSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = originalSecret; });
const legacyKey = `due:overdue:task-000:${dueDate.toISOString()}`;
const stubs: Record<string, unknown> = {
  "src/lib/notifications.ts": { createInAppNotification: async (input: { recipientId: string; dedupeKey: string }) => { sent.push(input); return { id: "notification" }; } },
  "src/lib/prisma.ts": { prisma: {
    task: { findMany: async (args: { where: Record<string, unknown>; take: number }) => { const start = calls.length * args.take; calls.push(args); return tasks.slice(start, start + args.take); } },
    notification: { findMany: async ({ where }: { where: { dedupeKey: { in: string[] } } }) => {
      const records = alreadyDelivered ? tasks.map((task) => ({ dedupeKey: `due:overdue:${task.id}:${dueDate.toISOString()}:recipient`, recipientId: "recipient" })) : [];
      if (legacyRecipient) records.push({ dedupeKey: legacyKey, recipientId: legacyRecipient });
      return records.filter((record) => where.dedupeKey.in.includes(record.dedupeKey));
    } },
  } },
};
const originals = Object.entries(stubs).map(([relative, exports]) => {
  const filename = path.join(process.cwd(), relative);
  const original = require.cache[filename];
  const stub = new Module(filename); stub.exports = exports; stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const { GET } = require(path.join(process.cwd(), "src/app/api/cron/due-notifications/route.ts")) as { GET: (request: NextRequest) => Promise<Response> };
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}
const run = (authorized = true) => GET(new NextRequest("http://localhost/api/cron/due-notifications", { headers: authorized ? { authorization: "Bearer test-only-cron-secret" } : {} }));
beforeEach(() => { calls = []; sent = []; legacyRecipient = null; alreadyDelivered = false; });

test("scheduled delivery scans beyond 500 tasks in bounded pages and excludes completed tasks in the query", async () => {
  const response = await run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).processed, 501);
  assert.equal(sent.length, 501);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.take === 200));
  assert.deepEqual(calls[0].where.column, { project: { isArchived: false }, OR: [{ integratedStatus: null }, { integratedStatus: { not: "DONE" } }] });
  assert.deepEqual(calls[1].where.OR, [{ dueDate: { gt: dueDate } }, { dueDate, id: { gt: "task-199" } }]);
});

test("legacy deliveries are preserved while a reassigned task gets a recipient-specific deduplication key", async () => {
  legacyRecipient = "recipient";
  await run();
  assert.equal(sent.some((row) => row.dedupeKey === `${legacyKey}:recipient`), false);
  calls = []; sent = []; legacyRecipient = "previous-assignee";
  await run();
  assert.ok(sent.some((row) => row.recipientId === "recipient" && row.dedupeKey === `${legacyKey}:recipient`));
});

test("unauthorized scheduled calls do not read tasks or deliver notifications", async () => {
  assert.equal((await run(false)).status, 401);
  assert.equal(calls.length + sent.length, 0);
});

test("existing recipient-specific deliveries are skipped before attempting notification writes", async () => {
  alreadyDelivered = true;
  assert.equal((await run()).status, 200);
  assert.equal(calls.length, 3);
  assert.equal(sent.length, 0);
});
