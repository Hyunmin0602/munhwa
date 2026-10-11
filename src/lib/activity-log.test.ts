import assert from "node:assert/strict";
import test from "node:test";
import { createActivityRecorder, eventActivityInputs, type ActivityInput } from "./activity-log";

const input: ActivityInput = { actorId: "actor", type: "사업", action: "삭제", entityType: "PROJECT", entityId: "deleted-project" };

test("department and deleted-project logs use explicit space without querying the deleted project", async () => {
  const rows: unknown[] = [];
  const record = createActivityRecorder({
    findProjectSpace: async () => { throw new Error("unexpected lookup"); },
    save: async (row) => { rows.push(row); },
    onError: (error) => { throw error; },
  });
  await record({ ...input, spaceId: "space", beforeData: { name: "사업" } });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { ...input, spaceId: "space", projectId: null, title: null, metadata: null, beforeData: '{"name":"사업"}', afterData: null });
});

test("existing project callers resolve the project space", async () => {
  let savedSpace: string | undefined;
  const record = createActivityRecorder({
    findProjectSpace: async (id) => { assert.equal(id, "project"); return "space"; },
    save: async (row) => { savedSpace = row.spaceId; },
    onError: (error) => { throw error; },
  });
  await record({ ...input, projectId: "project" });
  assert.equal(savedSpace, "space");
});

test("logging failure is reported once without retrying or failing an already completed mutation", async () => {
  let attempts = 0;
  const errors: unknown[] = [];
  const failure = new Error("storage unavailable");
  const record = createActivityRecorder({
    findProjectSpace: async () => null,
    save: async () => { attempts++; throw failure; },
    onError: (error) => { errors.push(error); },
  });
  await record({ ...input, spaceId: "space" });
  assert.equal(attempts, 1);
  assert.deepEqual(errors, [failure]);
  await record(input);
  assert.equal(attempts, 1);
  assert.equal(errors.length, 2);
});

const event = { id: "event", spaceId: "space", projectId: null, scope: "PERSONAL", title: "private title", description: "private description", color: "#6366f1", type: "BUSINESS", startDate: new Date(), endDate: new Date(), allDay: false, labelId: null };

test("personal events are omitted and scope transitions do not expose personal content", () => {
  assert.deepEqual(eventActivityInputs("actor", null, event), []);
  assert.deepEqual(eventActivityInputs("actor", event, null), []);
  assert.deepEqual(eventActivityInputs("actor", event, { ...event, title: "changed private title" }), []);
  for (const [before, after] of [[event, { ...event, scope: "SPACE" }], [{ ...event, scope: "SPACE" }, event]] as const) {
    const rows = eventActivityInputs("actor", before, after);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "일정 공개 범위 변경");
    assert.equal(JSON.stringify(rows).includes("private title"), false);
    assert.equal(JSON.stringify(rows).includes("private description"), false);
    assert.deepEqual(Object.keys(rows[0].beforeData!).sort(), ["projectId", "scope"]);
    assert.deepEqual(Object.keys(rows[0].afterData!).sort(), ["projectId", "scope"]);
  }
});

test("moving a public event records both spaces and ordinary updates record once", () => {
  const before = { ...event, scope: "PROJECT", projectId: "project" };
  const after = { ...before, spaceId: "other-space", projectId: "other-project" };
  const rows = eventActivityInputs("actor", before, after);
  assert.deepEqual(rows.map((row) => [row.spaceId, row.projectId]), [["space", "project"], ["other-space", "other-project"]]);
  assert.equal(eventActivityInputs("actor", before, { ...before, title: "updated" }).length, 1);
  assert.equal(eventActivityInputs("actor", before, null)[0].action, "삭제");
});
