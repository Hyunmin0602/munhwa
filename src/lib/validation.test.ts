import assert from "node:assert/strict";
import test from "node:test";
import { InputValidationError, normalizeEmail, optionalText, password, projectColor, projectStatus, projectTags, readJsonObject, requiredText } from "./validation";

test("normalizeEmail canonicalizes valid email input", () => {
  assert.equal(normalizeEmail(" User.Name@Example.COM "), "user.name@example.com");
  assert.throws(() => normalizeEmail("not-an-email"), InputValidationError);
});

test("registration text and password limits are enforced", () => {
  assert.equal(requiredText(" 홍길동 ", "이름", 50), "홍길동");
  assert.throws(() => requiredText("\u0000", "이름", 50), InputValidationError);
  assert.equal(password("twelve-chars!"), "twelve-chars!");
  assert.throws(() => password("short"), InputValidationError);
});

test("readJsonObject rejects an invalid content type and oversized body", async () => {
  await assert.rejects(() => readJsonObject(new Request("https://example.test", { method: "POST", body: "{}" })), InputValidationError);
  await assert.rejects(
    () => readJsonObject(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(32) }) }), 16),
    InputValidationError
  );
});

test("project values require bounded text and approved status and color values", () => {
  assert.equal(projectTags(["행사", "행사", "운영"]), "행사,운영");
  assert.equal(projectStatus("active"), "active");
  assert.equal(projectColor("#A1b2C3"), "#A1b2C3");
  assert.throws(() => projectTags(Array(11).fill("태그")), InputValidationError);
  assert.throws(() => projectStatus("unknown"), InputValidationError);
  assert.throws(() => projectColor("red"), InputValidationError);
});

test("optional text accepts an empty description", () => {
  assert.equal(optionalText("", "일정 설명", 2_000), null);
  assert.equal(optionalText("   ", "일정 설명", 2_000), null);
});
test("streaming JSON stops and cancels at the byte budget without trusting content-length", async () => {
  let reads = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(10)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const request = new Request("https://example.test", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body, duplex: "half",
  } as RequestInit);
  await assert.rejects(readJsonObject(request, 16), InputValidationError);
  assert.equal(reads, 2);
  assert.equal(cancelled, true);
});

test("streamed JSON preserves multibyte UTF-8 split across chunks", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ title: "사진" }));
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } });
  assert.deepEqual(await readJsonObject(new Request("https://example.test", {
    method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half",
  } as RequestInit)), { title: "사진" });
});
