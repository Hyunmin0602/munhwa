import assert from "node:assert/strict";
import test from "node:test";
import { apiFetch, getModalRequestErrorMessage, subscribeToToasts } from "./client-fetch";

test("mutations never retry, including Request inputs and method overrides", async (t) => {
  for (const method of ["POST", "PATCH", "DELETE"]) {
    for (const input of ["/api/test", new Request("https://example.test", { method })]) {
      let calls = 0;
      t.mock.method(globalThis, "fetch", async () => { calls++; throw new TypeError("network"); });
      await assert.rejects(apiFetch(input, typeof input === "string" ? { method } : undefined,
        { retries: 3, showGlobalError: false }), /network/);
      assert.equal(calls, 1);
      t.mock.restoreAll();
    }
  }
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 503 }); });
  await assert.rejects(apiFetch(new Request("https://example.test"), { method: "POST" },
    { retries: 3, showGlobalError: false }));
  assert.equal(calls, 1);
});

test("401 and abort do not retry or show error toasts", async (t) => {
  let calls = 0;
  let notifications = 0;
  const unsubscribe = subscribeToToasts(() => notifications++);
  try {
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 401 }); });
    await assert.rejects(apiFetch("/api/test"), /Unauthorized/);
    assert.equal(calls, 1);
    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () => { calls++; throw new DOMException("aborted", "AbortError"); });
    await assert.rejects(apiFetch("/api/test"), { name: "AbortError" });
    assert.equal(calls, 2);
    assert.equal(notifications, 0);
  } finally { unsubscribe(); }
});

test("abort during backoff prevents subsequent requests and toasts", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  let notifications = 0;
  const unsubscribe = subscribeToToasts(() => notifications++);
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new TypeError("network"); });
  try {
    const pending = apiFetch(new Request("https://example.test", { signal: controller.signal }));
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(calls, 1);
    assert.equal(notifications, 0);
  } finally { unsubscribe(); }
});

test("transient GET failures retry within the configured bound", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 1) throw new TypeError("network");
    if (calls === 2) return new Response(null, { status: 503 });
    return new Response("ok");
  });
  assert.equal(await (await apiFetch("/api/test")).text(), "ok");
  assert.equal(calls, 3);
});

test("already aborted signals never fetch; other server errors do not retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 501 }); });
  await assert.rejects(apiFetch("/api/test", { signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
  await assert.rejects(apiFetch("/api/test", undefined, { showGlobalError: false }));
  assert.equal(calls, 1);
});


test("modal errors display structured validation and conflict messages", async () => {
  for (const status of [400, 409]) {
    const response = Response.json({ error: { code: "VALIDATION_ERROR", message: "요청 본문이 너무 큽니다." } }, { status });
    assert.equal(await getModalRequestErrorMessage(response, "저장"), "요청 본문이 너무 큽니다.");
  }
});
