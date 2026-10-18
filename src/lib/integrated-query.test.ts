import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import {
  decodeIntegratedCursor, encodeIntegratedCursor, itemCountQuery, itemIdsQuery,
  kanbanColumnIdsQuery, kanbanTaskIdsQuery, projectFilterQuery, tagFilterQuery,
  type IdRow, type IntegratedScope,
} from "./integrated-query";

test("integrated queries bound rows, enforce access, and paginate without repeating", async () => {
  const client = createClient({ url: "file::memory:" });
  class SharedAdapter extends PrismaLibSql {
    createClient() { return client; }
  }
  const prisma = new PrismaClient({ adapter: new SharedAdapter({ url: "file::memory:" }) });
  const execute = async (query: Prisma.Sql) => (await prisma.$queryRaw<Array<Record<string, unknown>>>(query))
    .map((row) => "value" in row && row.value !== null ? { ...row, value: Number(row.value) } : row);
  const scope: IntegratedScope = { userId: "member", admin: false, spaceManager: false,
    spaceId: "space", projectIds: [], statuses: [], tag: "" };
  try {
    await client.executeMultiple(`
      CREATE TABLE User (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE Project (id TEXT PRIMARY KEY, name TEXT, color TEXT, status TEXT, tags TEXT, spaceId TEXT, updatedAt DATETIME, ownerId TEXT, isArchived BOOLEAN DEFAULT 0, accessScope TEXT DEFAULT 'MEMBERS');
      CREATE TABLE SpaceMember (spaceId TEXT, userId TEXT);
      CREATE TABLE ProjectMember (projectId TEXT, userId TEXT);
      CREATE TABLE KanbanColumn (id TEXT PRIMARY KEY, projectId TEXT);
      CREATE TABLE Task (id TEXT PRIMARY KEY, columnId TEXT, updatedAt DATETIME, dueDate DATETIME, "order" INTEGER DEFAULT 0);
      CREATE TABLE Event (id TEXT PRIMARY KEY, projectId TEXT, updatedAt DATETIME, startDate DATETIME);
      CREATE TABLE ArchivePost (id TEXT PRIMARY KEY, projectId TEXT, updatedAt DATETIME, kind TEXT, authorId TEXT, visibility TEXT, title TEXT DEFAULT 'Document');
    `);
    const inserts: Array<{ sql: string; args: Array<string | number | null> }> = [];
    for (let p = 0; p < 80; p++) {
      const id = `p${p.toString().padStart(2, "0")}`;
      inserts.push({ sql: 'INSERT INTO Project (id, name, color, status, tags, spaceId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [id, `Project ${p}`, "blue", "active", p % 2 ? "art, sports " : "arts,other", p < 60 ? "space" : "other", p] });
      if (p < 70) inserts.push({ sql: 'INSERT INTO ProjectMember VALUES (?, ?)', args: [id, "member"] });
      for (let c = 0; c < 5; c++) {
        const column = `${id}c${c}`;
        inserts.push({ sql: 'INSERT INTO KanbanColumn VALUES (?, ?)', args: [column, id] });
        for (let t = 0; t < 3; t++) {
          inserts.push({ sql: 'INSERT INTO Task (id, columnId, updatedAt, dueDate) VALUES (?, ?, ?, ?)', args: [`${column}t${t}`, column, p * 100 + c, p < 2 ? null : 1000] });
        }
      }
      inserts.push({ sql: 'INSERT INTO ArchivePost (id, projectId, updatedAt, kind, authorId, visibility) VALUES (?, ?, ?, ?, ?, ?)', args: [id, id, p, p % 2 ? "MEETING" : "DOCUMENT", p === 0 ? "member" : "other", p < 2 ? "PRIVATE" : "INTERNAL"] });
    }
    await client.batch(inserts, "write");
    assert.equal((await execute(projectFilterQuery(scope, 30, null))).length, 31);
    const admin = { ...scope, admin: true };
    assert.equal((await execute(projectFilterQuery(admin, 50, null))).length, 51);
    assert.equal((await execute(projectFilterQuery({ ...scope, tag: "art" }, 50, null))).length, 35);
    assert.equal((await execute(projectFilterQuery({ ...scope, tag: "sports" }, 50, null))).length, 35);
    assert.equal((await execute(projectFilterQuery({ ...scope, tag: "' OR 1=1 --" }, 50, null))).length, 0);
    assert.equal((await execute(projectFilterQuery(scope, 50, null, "Project 79"))).length, 0);
    assert.deepEqual((await execute(tagFilterQuery(scope))).map((row) => row.tag), ["art", "arts", "other", "sports"]);
    const ids = await execute(kanbanColumnIdsQuery(scope));
    assert.equal(ids.length, 9);
    const summaryTasks = await execute(kanbanTaskIdsQuery(ids.map((row) => String(row.id))));
    assert.equal(summaryTasks.length, 18);
    assert.ok(summaryTasks.every((row) => !String(row.id).endsWith("t2")));
    assert.equal((await execute(kanbanTaskIdsQuery([]))).length, 0);
    assert.deepEqual([...new Set(ids.map((row) => String(row.id).slice(0, 3)))].sort(), ["p67", "p68", "p69"]);
    assert.equal(Number((await execute(itemCountQuery(scope, "archive")))[0].count), 35);
    await client.execute("INSERT INTO User VALUES ('other', 'Writer'), ('member', 'Member')");
    assert.equal((await execute(itemIdsQuery(scope, "archive", 30, null, null, false, "Project 68"))).length, 1);
    assert.equal((await execute(itemIdsQuery(scope, "meeting", 50, null, null, false, "Writer"))).length, 34);
    assert.equal((await execute(itemIdsQuery(scope, "archive", 30, null, null, false, "' OR 1=1 --"))).length, 0);
    assert.equal(Number((await execute(itemCountQuery(scope, "meeting")))[0].count), 34);
    assert.equal(Number((await execute(itemCountQuery({ ...scope, spaceManager: true }, "meeting")))[0].count), 30);
    const seen: string[] = [];
    let cursor = null;
    do {
      const rows = await execute(itemIdsQuery(scope, "task", 31, cursor)) as unknown as IdRow[];
      const page = rows.slice(0, 30);
      seen.push(...page.map((row) => row.id));
      const last = page.at(-1);
      cursor = rows.length > 30 && last ? decodeIntegratedCursor(encodeIntegratedCursor({ type: "task", ...last }), "task") : null;
    } while (cursor);
    assert.equal(seen.length, 1050);
    assert.equal(new Set(seen).size, 1050);
    const page = await execute(projectFilterQuery(scope, 30, null)) as unknown as IdRow[];
    const last = page[29];
    await client.execute({ sql: 'DELETE FROM Project WHERE id = ?', args: [last.id] });
    const next = await execute(projectFilterQuery(scope, 30, { type: "projects", ...last }));
    assert.equal(next.length, 31);
    assert.ok(next.every((row) => !page.slice(0, 30).some((previous) => previous.id === row.id)));
    // Both epoch and ISO timestamps use the same range and cursor ordering.
    await client.execute("INSERT INTO Event VALUES ('epoch', 'p00', 1000, 1000), ('iso', 'p00', '1970-01-01T00:00:01.000Z', '1970-01-01T00:00:01.000Z')");
    assert.equal((await execute(itemIdsQuery(scope, "event", 30, null, { start: new Date(999), end: new Date(1001) }))).length, 2);
    await client.execute("INSERT INTO SpaceMember VALUES ('other', 'member')");
    await client.execute("UPDATE Project SET isArchived = 1, accessScope = 'SPACE' WHERE id = 'p79'");
    assert.equal((await execute(projectFilterQuery(scope, 30, null, "Project 79"))).length, 1);
    await client.execute("UPDATE Project SET accessScope = 'MEMBERS' WHERE id = 'p79'");
    assert.equal((await execute(projectFilterQuery(scope, 30, null, "Project 79"))).length, 0);
    await client.execute("UPDATE Project SET ownerId = 'member' WHERE id = 'p79'");
    assert.equal((await execute(projectFilterQuery(scope, 30, null, "Project 79"))).length, 1);
  } finally { await prisma.$disconnect(); client.close(); }
});

test("cursors reject invalid shapes and mismatched types", () => {
  for (const value of ["junk", Buffer.from("null").toString("base64url"),
    encodeIntegratedCursor({ type: "event", id: "id", value: 0 })]) {
    assert.throws(() => decodeIntegratedCursor(value, "archive"), /INVALID_CURSOR/);
  }
});
