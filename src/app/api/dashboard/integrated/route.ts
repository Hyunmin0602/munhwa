import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertSpaceManager } from "@/lib/server-utils";
import { internalError, unauthorized, validationError } from "@/lib/api-error";
import {
  INTEGRATED_TYPES, decodeIntegratedCursor, encodeIntegratedCursor, itemCountQuery, itemIdsQuery,
  kanbanColumnIdsQuery, kanbanTaskIdsQuery, projectFilterQuery, tagFilterQuery,
  type IdRow, type IntegratedScope, type IntegratedType,
} from "@/lib/integrated-query";

const projectSelect = { id: true, name: true, color: true, status: true } as const;
function getDayRange(range: string | null) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const endOfDay = (date: Date) => {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  };
  if (range === "today") {
    return { start, end: endOfDay(start) };
  }
  if (range === "30d") {
    const end = new Date(start);
    end.setDate(end.getDate() + 29);
    return { start, end: endOfDay(end) };
  }
  if (range === "all") return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end: endOfDay(end) };
}

function getRecentRange(range: string | null) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (range === "all") return null;
  const days = range === "today" ? 1 : range === "30d" ? 30 : 7;
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
}


export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const { searchParams } = request.nextUrl;
    const userId = session.user.id;
    const admin = await assertAdmin(userId);
    const spaceManager = !admin && await assertSpaceManager(userId);
    const requestedType = searchParams.get("type") ?? searchParams.get("types") ?? "all";
    const filtersOnly = searchParams.get("view") === "filters";
    if (!filtersOnly && requestedType !== "all" && !INTEGRATED_TYPES.includes(requestedType as IntegratedType)) {
      return validationError("한 번에 하나의 유형을 선택해주세요.");
    }
    const limitValue = Number(searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitValue) ? Math.min(50, Math.max(1, Math.floor(limitValue))) : 30;
    const projectIds = searchParams.get("projectIds")?.split(",").filter(Boolean) ?? [];
    const statuses = searchParams.get("status")?.split(",").filter(Boolean) ?? [];
    const tag = searchParams.get("tag")?.trim() ?? "";
    const query = searchParams.get("query")?.trim() ?? "";
    if (projectIds.length > 50 || statuses.length > 50 || tag.length > 256 || query.length > 256) {
      return validationError("필터 범위를 줄여주세요.");
    }
    const scope: IntegratedScope = { userId, admin, spaceManager, spaceId: DEFAULT_SPACE_ID, projectIds, statuses, tag };
    let cursor;
    try {
      cursor = decodeIntegratedCursor(searchParams.get("cursor"), filtersOnly ? "projects" : requestedType as IntegratedType);
    } catch { return validationError("페이지 커서가 올바르지 않습니다."); }
    if (requestedType === "all" && !filtersOnly && cursor) return validationError("요약 화면에는 커서를 사용할 수 없습니다.");

    if (filtersOnly) {
      const [rows, tags] = await Promise.all([
        withDbReadRetry(() => prisma.$queryRaw<Array<IdRow & { name: string; color: string; status: string }>>(projectFilterQuery(scope, limit, cursor, query))),
        cursor ? [] : withDbReadRetry(() => prisma.$queryRaw<Array<{ tag: string }>>(tagFilterQuery(scope))),
      ]);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return NextResponse.json({
        items: page.map(({ id, name, color, status }) => ({ id, name, color, status })),
        nextCursor: rows.length > limit && last ? encodeIntegratedCursor({ type: "projects", id: last.id, value: last.value === null ? null : Number(last.value) }) : null,
        tags: tags.map(({ tag }) => tag),
      });
    }

    const dayRange = getDayRange(searchParams.get("range"));
    const recentRange = getRecentRange(searchParams.get("range"));
    const readIds = (type: IntegratedType, take: number, recent = false, range: { start: Date; end: Date } | null = null) =>
      withDbReadRetry(() => prisma.$queryRaw<IdRow[]>(itemIdsQuery(scope, type, take, recent ? null : cursor, range, recent, requestedType === "all" ? "" : query))).then((rows) => rows.map((row) => ({ ...row, value: row.value === null ? null : Number(row.value) })));
    const hydrate = async (type: IntegratedType, rows: IdRow[]) => {
      const ids = rows.map(({ id }) => id);
      if (type === "task") {
        const tasks = await withDbReadRetry(() => prisma.task.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, dueDate: true, updatedAt: true, priority: true,
            column: { select: { name: true, projectId: true, project: { select: projectSelect } } },
            assignee: { select: { name: true } } },
        }));
        const byId = new Map(tasks.map((task) => [task.id, task]));
        return rows.flatMap(({ id }) => {
          const task = byId.get(id);
          return task ? [{ id, type, title: task.title, timestamp: task.dueDate?.toISOString() ?? new Date(0).toISOString(),
            updatedAt: task.updatedAt.toISOString(), dueDate: task.dueDate?.toISOString() ?? null, priority: task.priority,
            status: task.column.name, assigneeName: task.assignee?.name ?? null,
            href: `/dashboard/projects/${task.column.projectId}/kanban`, project: task.column.project }] : [];
        });
      }
      if (type === "event") {
        const events = await withDbReadRetry(() => prisma.event.findMany({
          where: { id: { in: ids } }, select: { id: true, title: true, startDate: true, updatedAt: true, projectId: true,
            creator: { select: { name: true } }, project: { select: projectSelect } },
        }));
        const byId = new Map(events.map((event) => [event.id, event]));
        return rows.flatMap(({ id }) => {
          const event = byId.get(id);
          return event?.project ? [{ id, type, title: event.title, timestamp: event.startDate.toISOString(),
            updatedAt: event.updatedAt.toISOString(), dueDate: event.startDate.toISOString(), authorName: event.creator.name,
            href: `/dashboard/projects/${event.projectId}/schedule`, project: event.project }] : [];
        });
      }
      const posts = await withDbReadRetry(() => prisma.archivePost.findMany({
        where: { id: { in: ids } }, select: { id: true, title: true, visibility: true, updatedAt: true, projectId: true,
          author: { select: { name: true } }, project: { select: projectSelect } },
      }));
      const byId = new Map(posts.map((post) => [post.id, post]));
      return rows.flatMap(({ id }) => {
        const post = byId.get(id);
        return post ? [{ id, type, title: post.title, timestamp: post.updatedAt.toISOString(), updatedAt: post.updatedAt.toISOString(),
          visibility: post.visibility, authorName: post.author.name,
          href: `/dashboard/projects/${post.projectId}/archive/${id}`, project: post.project }] : [];
      });
    };

    if (requestedType !== "all") {
      const type = requestedType as IntegratedType;
      const rows = await readIds(type, limit + 1, false, type === "task" || type === "event" ? dayRange : recentRange);
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return NextResponse.json({ items: await hydrate(type, page),
        nextCursor: rows.length > limit && last ? encodeIntegratedCursor({ type, ...last }) : null });
    }

    const [countRows, columnIds, upcoming, documents, recentGroups] = await Promise.all([
      Promise.all(INTEGRATED_TYPES.map((type) => withDbReadRetry(() => prisma.$queryRaw<Array<{ count: bigint | number }>>(
        itemCountQuery(scope, type, type === "event" ? dayRange : null))))),
      withDbReadRetry(() => prisma.$queryRaw<Array<{ id: string }>>(kanbanColumnIdsQuery(scope))),
      readIds("event", 5, false, dayRange).then((rows) => hydrate("event", rows)),
      readIds("archive", 5).then((rows) => hydrate("archive", rows)),
      Promise.all(INTEGRATED_TYPES.map((type) => readIds(type, 5, true).then((rows) => hydrate(type, rows)))),
    ]);
    const taskIds = await withDbReadRetry(() => prisma.$queryRaw<Array<{ id: string }>>(
      kanbanTaskIdsQuery(columnIds.map(({ id }) => id))));
    const [columns, kanbanTasks] = await Promise.all([
      withDbReadRetry(() => prisma.kanbanColumn.findMany({
        where: { id: { in: columnIds.map(({ id }) => id) } }, orderBy: [{ order: "asc" }, { id: "asc" }],
        select: { id: true, name: true, order: true, project: { select: projectSelect } },
      })),
      withDbReadRetry(() => prisma.task.findMany({
        where: { id: { in: taskIds.map(({ id }) => id) } },
        orderBy: [{ updatedAt: "desc" }, { order: "asc" }, { id: "asc" }],
        select: { id: true, title: true, dueDate: true, updatedAt: true, columnId: true },
      })),
    ]);
    const columnsWithTasks = columns.map((column) => ({ ...column,
      tasks: kanbanTasks.filter((task) => task.columnId === column.id).map(({ id, title, dueDate, updatedAt }) => ({ id, title, dueDate, updatedAt })),
    }));
    const kanban = [...new Map(columns.map((column) => [column.project.id, column.project])).values()].map((project) => ({
      project, columns: columnsWithTasks.filter((column) => column.project.id === project.id),
    })).sort((a, b) => {
      const latest = (entry: typeof a) => Math.max(...entry.columns.flatMap((column) => column.tasks.map((task) => task.updatedAt.getTime())));
      return latest(b) - latest(a) || b.project.id.localeCompare(a.project.id);
    }).map(({ project, columns }) => ({ project, columns: columns.map(({ id, name, order, tasks }) => ({ id, name, order, tasks })) }));
    const recent = recentGroups.flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
    const selected: typeof recent = [];
    const deferred: typeof recent = [];
    const typeCounts = new Map<string, number>();
    for (const item of recent) {
      if ((typeCounts.get(item.type) ?? 0) < 2) {
        selected.push(item); typeCounts.set(item.type, (typeCounts.get(item.type) ?? 0) + 1);
      } else deferred.push(item);
    }
    return NextResponse.json({ items: [], nextCursor: null, summary: {
      counts: Object.fromEntries(INTEGRATED_TYPES.map((type, i) => [type, Number(countRows[i][0]?.count ?? 0)])),
      kanban, events: upcoming, documents, recentUpdates: [...selected, ...deferred].slice(0, 3).map((item) => ({ ...item, timestamp: item.updatedAt })),
    } });
  } catch (error) {
    console.error("[api/dashboard/integrated] GET failed", error);
    return internalError("통합 업무를 불러오지 못했습니다.");
  }
}
