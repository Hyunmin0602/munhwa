import { Prisma } from "@prisma/client";

export const INTEGRATED_TYPES = ["task", "event", "archive", "meeting"] as const;
export type IntegratedType = typeof INTEGRATED_TYPES[number];
export type IntegratedCursor = { type: IntegratedType | "projects"; id: string; value: number | null };
export type IdRow = { id: string; value: number | null };
export type IntegratedScope = {
  userId: string; admin: boolean; spaceManager: boolean; spaceId: string;
  projectIds: string[]; statuses: string[]; tag: string;
};

export function encodeIntegratedCursor(cursor: IntegratedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeIntegratedCursor(value: string | null, type: IntegratedCursor["type"]) {
  if (!value) return null;
  try {
    if (value.length > 2048) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (cursor.type !== type || typeof cursor.id !== "string" || !cursor.id || cursor.id.length > 256
      || !(cursor.value === null || (typeof cursor.value === "number" && Number.isFinite(cursor.value)))) throw new Error();
    return cursor as IntegratedCursor;
  } catch { throw new Error("INVALID_CURSOR"); }
}

// Prisma's libSQL adapter may store timestamps as epoch milliseconds or ISO text.
function timestamp(column: Prisma.Sql) {
  return Prisma.sql`CASE WHEN typeof(${column}) IN ('integer', 'real') THEN ${column}
    ELSE unixepoch(${column}, 'subsec') * 1000 END`;
}

export function projectScopeSql(scope: IntegratedScope) {
  const access = scope.admin ? Prisma.sql`1 = 1` : scope.spaceManager
    ? Prisma.sql`p."spaceId" = ${scope.spaceId}`
    : Prisma.sql`(p."ownerId" = ${scope.userId} OR EXISTS (SELECT 1 FROM "ProjectMember" m WHERE m."projectId" = p.id AND m."userId" = ${scope.userId}) OR (p."isArchived" = 1 AND p."accessScope" = 'SPACE' AND EXISTS (SELECT 1 FROM "SpaceMember" sm WHERE sm."spaceId" = p."spaceId" AND sm."userId" = ${scope.userId})))`;
  return Prisma.sql`WITH RECURSIVE permitted_projects AS (
    SELECT p.* FROM "Project" p WHERE ${access}
    ${scope.projectIds.length ? Prisma.sql`AND p.id IN (${Prisma.join(scope.projectIds)})` : Prisma.empty}
    ${scope.statuses.length ? Prisma.sql`AND p.status IN (${Prisma.join(scope.statuses)})` : Prisma.empty}
  ), project_tags(projectId, rest, tag) AS (
    SELECT id, COALESCE(tags, '') || ',', '' FROM permitted_projects
    UNION ALL
    SELECT projectId, substr(rest, instr(rest, ',') + 1), trim(substr(rest, 1, instr(rest, ',') - 1))
    FROM project_tags WHERE rest <> ''
  ), eligible_projects AS (
    SELECT p.* FROM permitted_projects p
    ${scope.tag ? Prisma.sql`WHERE EXISTS (SELECT 1 FROM project_tags pt WHERE pt.projectId = p.id AND pt.tag = ${scope.tag})` : Prisma.empty}
  )`;
}

export function projectFilterQuery(scope: IntegratedScope, limit: number, cursor: IntegratedCursor | null, query = "") {
  const value = timestamp(Prisma.sql`p."updatedAt"`);
  return Prisma.sql`${projectScopeSql(scope)} SELECT p.id, p.name, p.color, p.status, ${value} AS value
    FROM eligible_projects p WHERE 1 = 1
    ${query ? Prisma.sql`AND instr(lower(p.name), lower(${query})) > 0` : Prisma.empty}
    ${cursor ? Prisma.sql`AND (${value} < ${cursor.value} OR (${value} = ${cursor.value} AND p.id < ${cursor.id}))` : Prisma.empty}
    ORDER BY ${value} DESC, p.id DESC LIMIT ${limit + 1}`;
}

export function tagFilterQuery(scope: IntegratedScope) {
  return Prisma.sql`${projectScopeSql(scope)} SELECT DISTINCT tag FROM project_tags WHERE tag <> '' ORDER BY tag LIMIT 50`;
}

function entitySql(scope: IntegratedScope, type: IntegratedType, recent: boolean) {
  if (type === "task") return {
    from: Prisma.sql`"Task" t JOIN "KanbanColumn" c ON c.id = t."columnId" JOIN eligible_projects p ON p.id = c."projectId"`,
    where: Prisma.sql`1 = 1`,
    value: timestamp(recent ? Prisma.sql`t."updatedAt"` : Prisma.sql`t."dueDate"`),
  };
  if (type === "event") return {
    from: Prisma.sql`"Event" t JOIN eligible_projects p ON p.id = t."projectId"`,
    where: Prisma.sql`1 = 1`,
    value: timestamp(recent ? Prisma.sql`t."updatedAt"` : Prisma.sql`t."startDate"`),
  };
  return {
    from: Prisma.sql`"ArchivePost" t JOIN eligible_projects p ON p.id = t."projectId"`,
    where: Prisma.sql`${type === "meeting" ? Prisma.sql`t.kind = 'MEETING'` : Prisma.sql`t.kind <> 'MEETING'`}
      ${scope.admin || scope.spaceManager ? Prisma.empty : Prisma.sql`AND (t."authorId" = ${scope.userId} OR t.visibility <> 'PRIVATE')`}`,
    value: timestamp(Prisma.sql`t."updatedAt"`),
  };
}

type Range = { start: Date; end: Date } | null;
export function itemIdsQuery(scope: IntegratedScope, type: IntegratedType, limit: number,
  cursor: IntegratedCursor | null = null, range: Range = null, recent = false, query = "") {
  const { from, where, value } = entitySql(scope, type, recent);
  const asc = !recent && (type === "task" || type === "event");
  const direction = asc ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  // SQLite puts null dates first in ascending order. Keep that ordering in the cursor.
  const after = !cursor ? Prisma.empty : asc
    ? cursor.value === null
      ? Prisma.sql`AND ((${value} IS NULL AND t.id > ${cursor.id}) OR ${value} IS NOT NULL)`
      : Prisma.sql`AND (${value} > ${cursor.value} OR (${value} = ${cursor.value} AND t.id > ${cursor.id}))`
    : Prisma.sql`AND (${value} < ${cursor.value} OR (${value} = ${cursor.value} AND t.id < ${cursor.id}))`;
  return Prisma.sql`${projectScopeSql(scope)} SELECT t.id, ${value} AS value FROM ${from}
    WHERE ${where}
    ${query ? Prisma.sql`AND instr(lower(t.title || ' ' || p.name || ' ' || COALESCE((SELECT u.name FROM "User" u WHERE u.id = ${type === "archive" || type === "meeting" ? Prisma.sql`t."authorId"` : Prisma.sql`t."creatorId"`}), '')), lower(${query})) > 0` : Prisma.empty}
    ${range ? Prisma.sql`AND ${value} >= ${range.start.getTime()} AND ${value} <= ${range.end.getTime()}` : Prisma.empty}
    ${after} ORDER BY ${value} ${direction}, t.id ${direction} LIMIT ${limit}`;
}

export function itemCountQuery(scope: IntegratedScope, type: IntegratedType, range: Range = null) {
  const { from, where, value } = entitySql(scope, type, false);
  return Prisma.sql`${projectScopeSql(scope)} SELECT COUNT(*) AS count FROM ${from} WHERE ${where}
    ${range ? Prisma.sql`AND ${value} >= ${range.start.getTime()} AND ${value} <= ${range.end.getTime()}` : Prisma.empty}`;
}

export function kanbanColumnIdsQuery(scope: IntegratedScope) {
  const updated = timestamp(Prisma.sql`t."updatedAt"`);
  return Prisma.sql`${projectScopeSql(scope)}, latest_columns AS (
    SELECT c.id, c."projectId", MAX(${updated}) AS latest FROM "KanbanColumn" c
    JOIN eligible_projects p ON p.id = c."projectId" JOIN "Task" t ON t."columnId" = c.id
    GROUP BY c.id, c."projectId"
  ), latest_projects AS (
    SELECT "projectId", MAX(latest) AS latest FROM latest_columns GROUP BY "projectId"
    ORDER BY latest DESC, "projectId" DESC LIMIT 3
  ), ranked_columns AS (
    SELECT c.id, ROW_NUMBER() OVER (PARTITION BY c."projectId" ORDER BY c.latest DESC, c.id DESC) AS rank
    FROM latest_columns c JOIN latest_projects p ON p."projectId" = c."projectId"
  ) SELECT id FROM ranked_columns WHERE rank <= 3`;
}

export function kanbanTaskIdsQuery(columnIds: string[]) {
  if (!columnIds.length) return Prisma.sql`SELECT id FROM "Task" WHERE 1 = 0`;
  return Prisma.sql`WITH ranked_tasks AS (
    SELECT t.id, ROW_NUMBER() OVER (PARTITION BY t."columnId"
      ORDER BY ${timestamp(Prisma.sql`t."updatedAt"`)} DESC, t."order" ASC, t.id ASC) AS rank
    FROM "Task" t WHERE t."columnId" IN (${Prisma.join(columnIds)})
  ) SELECT id FROM ranked_tasks WHERE rank <= 2`;
}
