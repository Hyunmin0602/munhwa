import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { beforeEach } from "node:test";
import { NextRequest } from "next/server";

const require = createRequire(path.join(process.cwd(), "package.json"));
const state = {
  project: { spaceId: "space-a", isArchived: false, space: { adminUserId: "space-admin" } },
  user: { id: "candidate", registrationStatus: "APPROVED", spaceMemberships: [{ id: "membership" }] },
  existing: false,
  writes: 0,
  logs: 0,
  failure: null as Error | null,
};

// Substitute the external boundary before loading the real route; no live DB or auth session is used.
const stubs: Record<string, unknown> = {
  "src/auth.ts": { auth: async () => ({ user: { id: "actor" } }) },
  "src/lib/server-utils.ts": {
    assertProjectOwner: async () => true,
    canManageProject: async () => true,
    assertProjectMember: async () => true,
    recordActivity: async () => { state.logs++; },
  },
  "src/lib/prisma.ts": { prisma: {
    project: { findUnique: async () => state.project },
    user: { findUnique: async () => state.user },
    projectMember: {
      findUnique: async () => state.existing ? { id: "existing-member" } : null,
      create: async ({ data }: { data: { userId: string; projectId: string; role: string } }) => {
        state.writes++;
        if (state.failure) throw state.failure;
        return { id: "new-member", ...data, user: { id: data.userId, name: "구성원", email: "member@example.test" } };
      },
    },
  } },
};
const originals = Object.keys(stubs).map((relative) => {
  const filename = path.join(process.cwd(), relative);
  const original = require.cache[filename];
  const stub = new Module(filename);
  stub.exports = stubs[relative];
  stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const { POST } = require(path.join(process.cwd(), "src/app/api/projects/[projectId]/members/route.ts")) as {
  POST: (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => Promise<Response>;
};
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}

function add(body: unknown = { userId: "candidate" }) {
  return POST(new NextRequest("https://example.test/api/projects/project/members", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ projectId: "project" }) });
}

beforeEach(() => {
  state.project = { spaceId: "space-a", isArchived: false, space: { adminUserId: "space-admin" } };
  state.user = { id: "candidate", registrationStatus: "APPROVED", spaceMemberships: [{ id: "membership" }] };
  state.existing = false;
  state.writes = 0;
  state.logs = 0;
  state.failure = null;
});

test("an approved Space member can be added and logged once", async () => {
  const response = await add();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).role, "member");
  assert.equal(state.writes, 1);
  assert.equal(state.logs, 1);
});

test("a user outside the project Space cannot be added by ID", async () => {
  state.user.spaceMemberships = [];
  const response = await add();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "FORBIDDEN");
  assert.equal(state.writes, 0);
});

test("pending and withdrawn users cannot be added even with Space membership", async () => {
  for (const registrationStatus of ["PENDING", "WITHDRAWN"]) {
    state.user.registrationStatus = registrationStatus;
    assert.equal((await add()).status, 403);
  }
  assert.equal(state.writes, 0);
});

test("the approved Space administrator remains eligible without a membership row", async () => {
  state.user.id = "space-admin";
  state.user.spaceMemberships = [];
  assert.equal((await add({ userId: "space-admin" })).status, 201);
});

test("archived projects reject member additions before writing", async () => {
  state.project.isArchived = true;
  const response = await add();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "CONFLICT");
  assert.equal(state.writes, 0);
});

test("member additions reject owner escalation and invalid input", async () => {
  for (const body of [{ userId: "candidate", role: "owner" }, { userId: {} }, {}]) {
    const response = await add(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
  assert.equal(state.writes, 0);
});

test("a concurrent duplicate returns a conflict without retrying the write", async () => {
  state.failure = Object.assign(new Error("unique constraint"), { code: "P2002" });
  const response = await add();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "CONFLICT");
  assert.equal(state.writes, 1);
  assert.equal(state.logs, 0);
});
