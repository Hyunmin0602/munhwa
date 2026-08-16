import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";

const ITEM_TYPES = ["task", "event", "archive", "meeting"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

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

function parseTypes(value: string | null): ItemType[] {
  const type = value?.split(",")[0];
  return type && ITEM_TYPES.includes(type as ItemType) ? [type as ItemType] : [...ITEM_TYPES];
}

type Cursor = Partial<Record<ItemType, string>>;

function parseCursor(value: string | null): Cursor {
  if (!value) return {};
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return ITEM_TYPES.reduce<Cursor>((cursor, type) => {
      if (typeof parsed[type] === "string") cursor[type] = parsed[type];
      return cursor;
    }, {});
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const userId = session.user.id;
  const requestedType = searchParams.get("type") ?? searchParams.get("types");
  const types = parseTypes(requestedType);
  const isOverview = !requestedType;
  const requestedProjectIds = searchParams.get("projectIds")?.split(",").filter(Boolean) ?? [];
  const status = searchParams.get("status")?.split(",").filter(Boolean) ?? [];
  const range = searchParams.get("range");
  const dayRange = getDayRange(range);
  const recentRange = getRecentRange(range);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
  const cursor = parseCursor(searchParams.get("cursor"));

  const projects = await withDbRetry(() =>
    prisma.project.findMany({
      where: {
        members: { some: { userId } },
        ...(requestedProjectIds.length ? { id: { in: requestedProjectIds } } : {}),
        ...(status.length ? { status: { in: status } } : {}),
      },
      select: { id: true, name: true, color: true, status: true },
      orderBy: { updatedAt: "desc" },
    })
  );
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return NextResponse.json({ items: [], nextCursor: null, filters: { projects } });

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const [taskCount, eventCount, archiveCount, meetingCount, kanbanColumns] = await withDbRetry(() =>
    Promise.all([
      prisma.task.count({
        where: { column: { projectId: { in: projectIds } } },
      }),
      prisma.event.count({
        where: { projectId: { in: projectIds }, startDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
      }),
      prisma.archivePost.count({
        where: {
          projectId: { in: projectIds },
          kind: { not: "MEETING" },
          OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }],
          ...(recentRange ? { updatedAt: { gte: recentRange.start, lte: recentRange.end } } : {}),
        },
      }),
      prisma.archivePost.count({
        where: {
          projectId: { in: projectIds },
          kind: "MEETING",
          OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }],
          ...(recentRange ? { updatedAt: { gte: recentRange.start, lte: recentRange.end } } : {}),
        },
      }),
      prisma.kanbanColumn.findMany({
        where: { projectId: { in: projectIds } },
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          projectId: true,
          tasks: {
            orderBy: [{ updatedAt: "desc" }, { order: "asc" }],
            take: 2,
            select: { id: true, title: true, dueDate: true, updatedAt: true },
          },
        },
      }),
    ])
  );
  const kanban = projects
    .map((project) => {
      const columnsWithTasks = kanbanColumns
        .filter((column) => column.projectId === project.id && column.tasks.length > 0)
        .sort((left, right) => Math.max(...right.tasks.map((task) => task.updatedAt.getTime())) - Math.max(...left.tasks.map((task) => task.updatedAt.getTime())))
        .slice(0, 3)
        .sort((left, right) => left.order - right.order);
      return { project, columns: columnsWithTasks };
    })
    .filter(({ columns }) => columns.length > 0)
    .sort((left, right) => {
      const latestTaskUpdate = (columns: typeof left.columns) => Math.max(...columns.flatMap((column) => column.tasks.map((task) => task.updatedAt.getTime())));
      return latestTaskUpdate(right.columns) - latestTaskUpdate(left.columns);
    })
    .slice(0, 3)
    .map(({ project, columns }) => ({
      project,
      columns: columns.map(({ id, name, order, tasks }) => ({ id, name, order, tasks })),
    }));
  const [tasks, events, archives, meetings] = await withDbRetry(() =>
    Promise.all([
      !isOverview && types.includes("task")
        ? prisma.task.findMany({
        where: { column: { projectId: { in: projectIds } }, dueDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
            select: { id: true, title: true, dueDate: true, priority: true, column: { select: { name: true, projectId: true } }, assignee: { select: { name: true } } },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            cursor: cursor.task ? { id: cursor.task } : undefined,
            skip: cursor.task ? 1 : 0,
            take: limit + 1,
          })
        : [],
      types.includes("event")
        ? prisma.event.findMany({
        where: { projectId: { in: projectIds }, startDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
            select: { id: true, title: true, startDate: true, endDate: true, projectId: true, creator: { select: { name: true } } },
            orderBy: [{ startDate: "asc" }, { id: "asc" }],
            cursor: cursor.event ? { id: cursor.event } : undefined,
            skip: cursor.event ? 1 : 0,
            take: limit + 1,
          })
        : [],
      types.includes("archive")
        ? prisma.archivePost.findMany({
            where: {
              projectId: { in: projectIds },
              kind: { not: "MEETING" },
              OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }],
              ...(recentRange ? { updatedAt: { gte: recentRange.start, lte: recentRange.end } } : {}),
            },
            select: { id: true, title: true, kind: true, visibility: true, updatedAt: true, projectId: true, author: { select: { name: true } } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            cursor: cursor.archive ? { id: cursor.archive } : undefined,
            skip: cursor.archive ? 1 : 0,
            take: limit + 1,
          })
        : [],
      types.includes("meeting")
        ? prisma.archivePost.findMany({
            where: {
              projectId: { in: projectIds },
              kind: "MEETING",
              OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }],
              ...(recentRange ? { updatedAt: { gte: recentRange.start, lte: recentRange.end } } : {}),
            },
            select: { id: true, title: true, kind: true, visibility: true, updatedAt: true, projectId: true, author: { select: { name: true } } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            cursor: cursor.meeting ? { id: cursor.meeting } : undefined,
            skip: cursor.meeting ? 1 : 0,
            take: limit + 1,
          })
        : [],
    ])
  );

  const items = [
    ...tasks.map((task) => ({
      id: task.id,
      type: "task" as const,
      title: task.title,
      timestamp: task.dueDate?.toISOString() ?? new Date(0).toISOString(),
      dueDate: task.dueDate?.toISOString() ?? null,
      priority: task.priority,
      status: task.column.name,
      assigneeName: task.assignee?.name ?? null,
      href: `/dashboard/projects/${task.column.projectId}/kanban`,
      project: projectById.get(task.column.projectId)!,
    })),
    ...events.map((event) => ({
      id: event.id,
      type: "event" as const,
      title: event.title,
      timestamp: event.startDate.toISOString(),
      dueDate: event.startDate.toISOString(),
      authorName: event.creator.name,
      href: `/dashboard/projects/${event.projectId}/schedule`,
      project: projectById.get(event.projectId)!,
    })),
    ...archives.map((post) => ({
        id: post.id,
        type: "archive" as const,
        title: post.title,
        timestamp: post.updatedAt.toISOString(),
        visibility: post.visibility,
        authorName: post.author.name,
        href: `/dashboard/projects/${post.projectId}/archive/${post.id}`,
        project: projectById.get(post.projectId)!,
      })),
    ...meetings.map((post) => ({
      id: post.id,
      type: "meeting" as const,
      title: post.title,
      timestamp: post.updatedAt.toISOString(),
      visibility: post.visibility,
      authorName: post.author.name,
      href: `/dashboard/projects/${post.projectId}/archive/${post.id}`,
      project: projectById.get(post.projectId)!,
    })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp) || left.type.localeCompare(right.type) || left.id.localeCompare(right.id));

  const page = items.slice(0, limit);
  const nextCursorState = page.reduce<Cursor>((current, item) => ({ ...current, [item.type]: item.id }), { ...cursor });
  const returnedCounts = page.reduce<Partial<Record<ItemType, number>>>((counts, item) => ({ ...counts, [item.type]: (counts[item.type] ?? 0) + 1 }), {});
  const hasMore = tasks.length > (returnedCounts.task ?? 0)
    || events.length > (returnedCounts.event ?? 0)
    || archives.length > (returnedCounts.archive ?? 0)
    || meetings.length > (returnedCounts.meeting ?? 0);
  const nextCursor = hasMore ? Buffer.from(JSON.stringify(nextCursorState)).toString("base64url") : null;
  return NextResponse.json({
    items: page,
    nextCursor,
    filters: { projects },
    summary: {
      counts: { task: taskCount, event: eventCount, archive: archiveCount, meeting: meetingCount },
      kanban,
    },
  });
}