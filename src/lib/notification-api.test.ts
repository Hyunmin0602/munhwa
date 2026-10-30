import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { NextRequest } from "next/server";

const require = createRequire(path.join(process.cwd(), "package.json"));
let userId: string | null = "recipient";
let reads: Array<Record<string, unknown>> = [];
let writes: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
let preferenceWrites = 0;
const stubs: Record<string, unknown> = {
  "src/auth.ts": { auth: async () => userId ? { user: { id: userId } } : null },
  "src/lib/prisma.ts": { prisma: {
    notification: {
      findMany: async (args: Record<string, unknown>) => { reads.push(args); return []; },
      count: async () => 3,
      updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => { writes.push(args); return { count: args.where.id === "foreign" ? 0 : 1 }; },
    },
    notificationPreference: {
      findUnique: async () => null,
      upsert: async ({ update }: { update: Record<string, unknown> }) => { preferenceWrites++; return update; },
    },
  } },
};
const originals = Object.entries(stubs).map(([relative, exports]) => {
  const filename = path.join(process.cwd(), relative);
  const original = require.cache[filename];
  const stub = new Module(filename); stub.exports = exports; stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const api = require(path.join(process.cwd(), "src/app/api/notifications/route.ts")) as { GET: (req: NextRequest) => Promise<Response>; PATCH: (req: NextRequest) => Promise<Response> };
const preferenceApi = require(path.join(process.cwd(), "src/app/api/notifications/preferences/route.ts")) as { PATCH: (req: NextRequest) => Promise<Response> };
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}
const get = (query = "") => api.GET(new NextRequest(`http://localhost/api/notifications?${query}`));
const patch = (body: unknown, preferences = false) => (preferences ? preferenceApi.PATCH : api.PATCH)(new NextRequest("http://localhost/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
beforeEach(() => { userId = "recipient"; reads = []; writes = []; preferenceWrites = 0; });

test("unread filtering and individual read writes always retain the recipient boundary", async () => {
  const response = await get("unreadOnly=true");
  assert.equal(response.status, 200);
  assert.deepEqual(reads[0].where, { recipientId: "recipient", readAt: null });
  assert.equal((await response.json()).unreadCount, 3);
  const foreign = await patch({ notificationId: "foreign" });
  assert.equal((await foreign.json()).updatedCount, 0);
  assert.deepEqual(writes[0].where, { recipientId: "recipient", readAt: null, id: "foreign" });
});

test("read-all is one write bounded by server time and returns the persisted read timestamp", async () => {
  const response = await patch({ markAllRead: true });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].where, { recipientId: "recipient", readAt: null, createdAt: { lte: new Date(data.readAt) } });
  assert.deepEqual(writes[0].data, { readAt: new Date(data.readAt) });
});

test("malformed JSON, conflicting read actions and invalid list inputs return validation errors without writes", async () => {
  for (const body of [[], {}, { markAllRead: false }, { markAllRead: true, notificationId: "first" }, { notificationId: " " }]) {
    const response = await patch(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
  const response = await api.PATCH(new NextRequest("http://localhost/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, body: "{" }));
  assert.equal(response.status, 400);
  for (const query of ["limit=1.5", "limit=Infinity", "unreadOnly=invalid", "cursor=bad%7Ccursor"]) assert.equal((await get(query)).status, 400);
  assert.equal(writes.length, 0);
});

test("settings accept exactly one boolean preference and report invalid requests as validation errors", async () => {
  for (const body of [[], { mentionNotifications: "false" }, { mentionNotifications: true, approvalNotifications: false }, { mentionNotifications: true, extra: true }]) {
    assert.equal((await patch(body, true)).status, 400);
  }
  assert.equal(preferenceWrites, 0);
  assert.equal((await patch({ mentionNotifications: false }, true)).status, 200);
  assert.equal(preferenceWrites, 1);
});

test("unauthenticated requests never query or change notifications", async () => {
  userId = null;
  assert.equal((await get()).status, 401);
  assert.equal((await patch({ markAllRead: true })).status, 401);
  assert.equal((await patch({ mentionNotifications: false }, true)).status, 401);
  assert.equal(reads.length + writes.length + preferenceWrites, 0);
});
