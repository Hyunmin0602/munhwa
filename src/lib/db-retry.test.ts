import assert from "node:assert/strict";
import test from "node:test";
import { withDbReadRetry, withDbWrite } from "./db-retry";

test("read retries transient database failures", async () => {
  let attempts = 0;
  const result = await withDbReadRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("connection reset"), { code: "P1001" });
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("write never retries implicitly", async () => {
  let attempts = 0;

  await assert.rejects(
    () => withDbWrite(async () => {
      attempts += 1;
      throw Object.assign(new Error("connection reset"), { code: "P1001" });
    }),
    /connection reset/,
  );

  assert.equal(attempts, 1);
});
