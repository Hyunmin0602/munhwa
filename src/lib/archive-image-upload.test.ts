import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import { NextRequest } from "next/server";

const require = createRequire(path.join(process.cwd(), "package.json"));
const state = { uploadFailure: null as Error | null, writeFailure: null as Error | null, uploads: 0, writes: 0, deleted: [] as string[] };
const blobUrl = "https://example.private.blob.test/archive/test.png";
const originals = [
  { filename: path.join(process.cwd(), "src/auth.ts"), exports: { auth: async () => ({ user: { id: "actor" } }) } },
  { filename: path.join(process.cwd(), "src/lib/server-utils.ts"), exports: {
    assertProjectMember: async () => true,
    assertProjectEditor: async () => true,
    canManageProject: async () => true,
    recordActivity: async () => {},
  } },
  { filename: path.join(process.cwd(), "src/lib/prisma.ts"), exports: { prisma: {
    archivePost: { findFirst: async () => ({ authorId: "actor", visibility: "PRIVATE", collaborators: [] }) },
    archiveImage: { create: async ({ data }: { data: Record<string, unknown> }) => {
      state.writes++;
      if (state.writeFailure) throw state.writeFailure;
      return { id: "image", ...data };
    } },
  } } },
  { filename: require.resolve("@vercel/blob"), exports: {
    put: async () => {
      state.uploads++;
      if (state.uploadFailure) throw state.uploadFailure;
      return { url: blobUrl, pathname: "archive/test.png" };
    },
    del: async (url: string) => { state.deleted.push(url); },
  } },
].map(({ filename, exports }) => {
  const original = require.cache[filename];
  const stub = new Module(filename);
  stub.exports = exports;
  stub.loaded = true;
  require.cache[filename] = stub;
  return { filename, original };
});
const { POST } = require(path.join(process.cwd(), "src/app/api/projects/[projectId]/archive/[postId]/images/route.ts")) as {
  POST: (request: NextRequest, context: { params: Promise<{ projectId: string; postId: string }> }) => Promise<Response>;
};
for (const { filename, original } of originals) {
  if (original) require.cache[filename] = original;
  else delete require.cache[filename];
}
const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
const savedVercel = process.env.VERCEL;
after(() => {
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  if (savedVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = savedVercel;
});
beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-only-token";
  process.env.VERCEL = "1";
  state.uploadFailure = null;
  state.writeFailure = null;
  state.uploads = 0;
  state.writes = 0;
  state.deleted = [];
});
function upload(request?: NextRequest) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "test.png", { type: "image/png" }));
  return POST(request ?? new NextRequest("https://example.test/upload", { method: "POST", body }), {
    params: Promise.resolve({ projectId: "project", postId: "post" }),
  });
}

test("successful uploads return the protected image URL", async () => {
  const response = await upload();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).url, "/api/projects/project/archive/post/images/image");
  assert.equal(state.uploads, 1);
  assert.equal(state.writes, 1);
});

test("Blob failures do not expose upstream credentials or URLs", async (t) => {
  t.mock.method(console, "error", () => {});
  state.uploadFailure = new Error("request failed: token=private-secret url=https://private.example.test");
  const response = await upload();
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(payload).includes("private"), false);
  assert.equal(state.uploads, 1);
  assert.equal(state.writes, 0);
});

test("DB failures clean up the uploaded Blob and never retry a write", async (t) => {
  t.mock.method(console, "error", () => {});
  state.writeFailure = new Error("connection failed with private-db-secret");
  const response = await upload();
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes("private-db-secret"), false);
  assert.equal(state.writes, 1);
  assert.deepEqual(state.deleted, [blobUrl]);
});

test("malformed multipart requests return a structured validation error", async () => {
  const response = await upload(new NextRequest("https://example.test/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  assert.equal(state.uploads, 0);
});

test("unconfigured storage returns a user message without environment variable names", async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const response = await upload();
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(payload).includes("BLOB_READ_WRITE_TOKEN"), false);
  assert.equal(state.uploads, 0);
});
