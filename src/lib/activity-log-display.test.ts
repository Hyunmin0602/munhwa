import assert from "node:assert/strict";
import test from "node:test";
import { activityChanges, activityData, activityDateRange, activityValue } from "./activity-log-display";

test("change comparison shows additions, removals and null changes without treating reordered objects as changes", () => {
  const rows = activityChanges({ beforeData: JSON.stringify({ removed: 1, assigneeId: null, unchanged: { a: 1, b: 2 } }), afterData: JSON.stringify({ assigneeId: "user", added: false, unchanged: { b: 2, a: 1 } }) });
  assert.deepEqual(rows.filter((row) => row.changed).map((row) => row.key), ["removed", "assigneeId", "added"]);
  assert.equal(activityValue("removed", rows[0].after), "기록 없음");
  assert.equal(activityValue("assigneeId", null), "없음");
});

test("legacy and malformed snapshots remain readable, and user text is not translated as an enum", () => {
  assert.deepEqual(activityData("legacy text"), { value: "legacy text" });
  assert.deepEqual(activityData("[]"), { value: [] });
  assert.deepEqual(activityData(null), {});
  assert.equal(activityValue("title", "DONE"), "DONE");
  assert.equal(activityValue("integratedStatus", "DONE"), "완료");
});

test("quick ranges use Korean dates at midnight and cross month boundaries", () => {
  assert.deepEqual(activityDateRange(1, new Date("2026-10-10T15:01:00Z")), { from: "2026-10-11", to: "2026-10-11" });
  assert.deepEqual(activityDateRange(7, new Date("2026-10-01T00:00:00Z")), { from: "2026-09-25", to: "2026-10-01" });
});
