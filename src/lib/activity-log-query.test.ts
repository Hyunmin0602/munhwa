import assert from "node:assert/strict";
import test from "node:test";
import { activityLogCursor, activityLogQuery } from "./activity-log-query";

test("date filters include the full selected Korean calendar day", () => {
  const { where, limit } = activityLogQuery(new URLSearchParams("from=2026-10-11&to=2026-10-11"), "space");
  assert.equal(limit, 30);
  assert.equal(where.spaceId, "space");
  assert.deepEqual(where.createdAt, { gte: new Date("2026-10-10T15:00:00Z"), lt: new Date("2026-10-11T15:00:00Z") });
});

test("invalid calendar dates, reversed ranges and malformed filters are rejected", () => {
  for (const query of ["from=2026-02-30", "to=bad", "from=2026-10-12&to=2026-10-11", "limit=2.5", "limit=Infinity", "order=wrong", `query=${"a".repeat(101)}`]) {
    assert.throws(() => activityLogQuery(new URLSearchParams(query), "space"));
  }
  assert.equal(activityLogQuery(new URLSearchParams("limit=100"), "space").limit, 50);
});

test("cursor uses time and ID boundaries in both directions without depending on an existing anchor row", () => {
  const log = { id: "log-2", createdAt: new Date("2026-10-11T03:00:00Z") };
  for (const order of ["asc", "desc"] as const) {
    const cursor = activityLogCursor(log, order);
    const { where } = activityLogQuery(new URLSearchParams({ cursor, order, type: "문서", actor: "김", project: "사업" }), "space");
    const comparison = order === "desc" ? "lt" : "gt";
    assert.deepEqual(where.AND, [{ OR: [{ createdAt: { [comparison]: log.createdAt } }, { createdAt: log.createdAt, id: { [comparison]: log.id } }] }]);
    assert.equal(where.type, "문서");
    assert.ok(where.actor);
    assert.ok(where.project);
    assert.throws(() => activityLogQuery(new URLSearchParams({ cursor, order: order === "asc" ? "desc" : "asc" }), "space"));
  }
  assert.throws(() => activityLogQuery(new URLSearchParams("cursor=invalid"), "space"));
});
