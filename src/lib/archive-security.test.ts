import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as errors from "./api-error";
import * as validation from "./validation";
import * as visibility from "./archive-visibility";
import * as imageValidation from "./archive-images";

const requireModule = createRequire(`${process.cwd()}/package.json`);
function load<T>(file: string, mocks: Record<string, unknown>) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(`${process.cwd()}/${file}`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  runInNewContext(code, { exports, Error, Uint8Array, Response, Request, Blob, URL,
    process: { env: { BLOB_READ_WRITE_TOKEN: "test-only" }, cwd: () => process.cwd() },
    console: { error() {} }, require: (name: string) => mocks[name] ?? requireModule(name),
  });
  return exports as T;
}
const params = { params: Promise.resolve({ projectId: "project", postId: "post", imageId: "image" }) };
type Handler = (request: NextRequest, context: typeof params) => Promise<Response>;

function fixture() {
  const state = { userId: "member" as string | null, authorId: "author", member: true, manager: false, editable: true, collaborators: [] as { userId: string }[] };
  let storageReads = 0;
  let metadataReads = 0;
  const image = { id: "image", storageKey: "archive/post/image.png", url: "local:archive/post/image.png", mimeType: "image/png", uploaderId: "author", post: { id: "post", projectId: "project", collaborators: [] } };
  const db = {
    archivePost: { findFirst: async () => ({ authorId: state.authorId, visibility: "PRIVATE", collaborators: state.collaborators }) },
    archiveImage: {
      findFirst: async () => { metadataReads++; return image; },
      findUnique: async () => { metadataReads++; return image; },
      findMany: async () => { metadataReads++; return [image]; },
    },
  };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse },
    "@/auth": { auth: async () => state.userId ? { user: { id: state.userId } } : null },
    "@/lib/prisma": { prisma: db },
    "@/lib/db-retry": { withDbReadRetry: (fn: () => unknown) => fn(), withDbWrite: (fn: () => unknown) => fn() },
    "@/lib/api-error": errors, "@/lib/validation": validation,
    "@/lib/archive-visibility": visibility, "@/lib/archive-images": imageValidation,
    "@/lib/notifications": { createInAppNotification: async () => {} },
    "@/lib/server-utils": { assertProjectMember: async () => state.member, assertProjectEditor: async () => state.editable, recordActivity: async () => {},
      canManageProject: async () => state.manager, canViewAllArchivePosts: async () => state.manager },
    "@/lib/archive-image-storage": { localArchiveImagePath: (key: string) => `/private/${key}`,
      archiveImageResponse: async () => { storageReads++; return new Response("image", { headers: { "Cache-Control": "private, no-store" } }); } },
  };
  mocks["@/lib/archive-access"] = load("src/lib/archive-access.ts", mocks);
  return { state, mocks, counts: () => ({ storageReads, metadataReads }) };
}

test("private image list and individual reads enforce author/collaborator/manager access", async () => {
  const { state, mocks, counts } = fixture();
  const image = load<{ GET: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/images/[imageId]/route.ts", mocks);
  const list = load<{ GET: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/images/route.ts", mocks);
  const request = new NextRequest("https://app.test/api/image");
  assert.equal((await image.GET(request, params)).status, 403);
  assert.equal((await list.GET(request, params)).status, 403);
  assert.deepEqual(counts(), { storageReads: 0, metadataReads: 0 });
  for (const actor of ["author", "collaborator", "manager"]) {
    state.userId = actor;
    state.collaborators = [{ userId: "collaborator" }];
    state.manager = actor === "manager";
    const response = await image.GET(request, params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  state.userId = null;
  assert.equal((await image.GET(request, params)).status, 401);
});

test("legacy upload URLs rewrite to a handler that also requires post access", async () => {
  const { state, mocks } = fixture();
  const proxy = load<{ proxy: (request: NextRequest) => Promise<Response>; config: { matcher: string[] } }>("src/proxy.ts", {
    ...mocks, "@/auth": { auth: (fn: unknown) => fn }, "@/lib/rate-limit": {},
  });
  assert.ok(proxy.config.matcher.includes("/uploads/:path*"));
  const rewritten = await proxy.proxy(new NextRequest("https://app.test/uploads/archive/post/image.png"));
  const destination = new URL(rewritten.headers.get("x-middleware-rewrite")!);
  assert.equal(destination.pathname, "/api/archive-images");
  assert.equal(destination.searchParams.get("key"), "archive/post/image.png");
  const legacy = load<{ GET: (request: NextRequest) => Promise<Response> }>("src/app/api/archive-images/route.ts", mocks);
  state.userId = null;
  assert.equal((await legacy.GET(new NextRequest(destination))).status, 401);
  state.userId = "member";
  assert.equal((await legacy.GET(new NextRequest(destination))).status, 403);
  state.userId = "author";
  assert.equal((await legacy.GET(new NextRequest(destination))).status, 200);
});

test("upload errors never expose storage details and oversized streams cancel before parsing", async () => {
  const { state, mocks } = fixture();
  state.userId = "author";
  mocks["@vercel/blob"] = { put: async () => { throw new Error("INTERNAL_STORAGE_DETAIL_TEST"); } };
  const { POST } = load<{ POST: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/images/route.ts", mocks);
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "test.png");
  const response = await POST(new NextRequest("https://app.test/api/image", { method: "POST", body: form }), params);
  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.error.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(payload), /INTERNAL_STORAGE_DETAIL_TEST/);
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(3 * 1024 * 1024)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const oversized = await POST(new NextRequest("https://app.test/api/image", {
    method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body, duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]), params);
  assert.equal(oversized.status, 400);
  assert.equal(cancelled, true);
});

test("registration responses match for new, existing, and concurrently created email addresses", async () => {
  const { mocks } = fixture();
  let exists = false;
  let duplicate = false;
  let writes = 0;
  let hashes = 0;
  mocks["bcryptjs"] = { hash: async () => { hashes++; return "hash"; } };
  mocks["@/lib/rate-limit"] = { checkRateLimit: async () => ({ allowed: true }), getClientIp: () => "test", LOGIN_EMAIL_LIMIT: {} };
  mocks["@/lib/prisma"] = { prisma: { cohort: { findFirst: async () => ({ id: "cohort" }) },
    user: { findUnique: async () => exists ? { id: "user" } : null,
      create: async () => { writes++; if (duplicate) throw Object.assign(new Error("duplicate"), { code: "P2002" }); return { id: "user" }; } } } };
  const { POST } = load<{ POST: (request: NextRequest) => Promise<Response> }>("src/app/api/register/route.ts", mocks);
  const request = () => new NextRequest("https://app.test/api/register", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Name", email: "user@example.com", password: "long-password!", cohortId: "cohort" }) });
  for (const scenario of ["new", "existing", "concurrent"]) {
    exists = scenario === "existing";
    duplicate = scenario === "concurrent";
    const response = await POST(request());
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, pendingApproval: true });
  }
  assert.equal(writes, 2);
  assert.equal(hashes, 3);
});

test("document saves reject oversized and non-string content before any database write", async () => {
  const { state, mocks } = fixture();
  state.userId = "author";
  let writes = 0;
  const db = (mocks["@/lib/prisma"] as { prisma: { archivePost: Record<string, unknown> } }).prisma;
  db.archivePost.update = async () => { writes++; return {}; };
  const { PATCH } = load<{ PATCH: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/route.ts", mocks);
  for (const body of [{ content: "x".repeat(17 * 1024) }, { content: { set: "unexpected" } }, { title: "x".repeat(201) }]) {
    const response = await PATCH(new NextRequest("https://app.test/api/post", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }), params);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
  assert.equal(writes, 0);
});

test("local image storage is private, traversal is rejected, and reads never redirect", async () => {
  let opened = "";
  const storage = load<{
    localArchiveImagePath: (key: string) => string;
    archiveImageResponse: (image: { storageKey: string; url: string; mimeType: string }) => Promise<Response>;
  }>("src/lib/archive-image-storage.ts", {
    "node:fs/promises": { readFile: async (file: string) => { opened = file; return new Uint8Array([1, 2]); } },
    "@vercel/blob": {},
  });
  assert.throws(() => storage.localArchiveImagePath("archive/post/../../secret.png"));
  assert.throws(() => storage.localArchiveImagePath("archive/../image.png"));
  const key = "archive/post/image.png";
  const response = await storage.archiveImageResponse({ storageKey: key, url: `local:${key}`, mimeType: "image/png" });
  assert.match(opened, /\.private\/archive-images\/archive\/post\/image.png$/);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("authenticated attachment paths cannot use the shared Next image optimizer", () => {
  const config = load<{ default: { images: { localPatterns: { pathname: string; search: string }[] } } }>("next.config.ts", {});
  const { hasLocalMatch } = requireModule("next/dist/shared/lib/match-local-pattern") as {
    hasLocalMatch: (patterns: { pathname: string; search: string }[], url: string) => boolean;
  };
  for (const url of ["/uploads/archive/post/image.png", "/api/projects/project/archive/post/images/image", "/api/archive-images?key=archive/post/image.png"]) {
    assert.equal(hasLocalMatch(config.default.images.localPatterns, url), false);
  }
  assert.equal(hasLocalMatch(config.default.images.localPatterns, "/assets/logo.png"), true);
});


test("read-only archived projects reject attachment mutations", async () => {
  const { state, mocks, counts } = fixture();
  state.userId = "author";
  state.editable = false;
  const { POST } = load<{ POST: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/images/route.ts", mocks);
  const { DELETE } = load<{ DELETE: Handler }>("src/app/api/projects/[projectId]/archive/[postId]/images/[imageId]/route.ts", mocks);
  const request = new NextRequest("https://app.test/api/image");
  assert.equal((await POST(request, params)).status, 403);
  assert.equal((await DELETE(request, params)).status, 403);
  assert.deepEqual(counts(), { storageReads: 0, metadataReads: 0 });
});
