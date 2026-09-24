import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertSpaceAdmin } from "@/lib/server-utils";

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
  const types = value?.split(",").filter((type): type is ItemType => ITEM_TYPES.includes(type as ItemType)) ?? [];
  return types.length ? [...new Set(types)] : [...ITEM_TYPES];
}

type Cursor = Partial<Record<ItemType, string>>;

type RecentUpdate = { id: string; type: ItemType; timestamp: string };

function selectRecentUpdates<T extends RecentUpdate>(items: T[]) {
  const selected: T[] = [];
  const deferred: T[] = [];
  const typeCounts: Partial<Record<ItemType, number>> = {};

  for (const item of items.sort((left, right) => right.timestamp.localeCompare(left.timestamp) || left.id.localeCompare(right.id))) {
    if ((typeCounts[item.type] ?? 0) < 2) {
      selected.push(item);
      typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
    } else {
      deferred.push(item);
    }
  }

  return [...selected, ...deferred].slice(0, 3);
}

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
  const canViewAll = await assertAdmin(userId);
  const canViewSpace = !canViewAll && await assertSpaceAdmin(userId);
  const canViewArchiveAll = canViewAll || canViewSpace;
  const requestedType = searchParams.get("type") ?? searchParams.get("types");
  const types = parseTypes(requestedType);
  const isOverview = !requestedType || requestedType === "all";
  const requestedProjectIds = searchParams.get("projectIds")?.split(",").filter(Boolean) ?? [];
  const requestedTag = searchParams.get("tag")?.trim() ?? "";
  const status = searchParams.get("status")?.split(",").filter(Boolean) ?? [];
  const range = searchParams.get("range");
  const dayRange = getDayRange(range);
  const recentRange = getRecentRange(range);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 50);
  const rawCursor = parseCursor(searchParams.get("cursor"));
  const activeType = !isOverview && types.length === 1 ? types[0] : null;
  const needsTasks = isOverview || types.includes("task");
  const needsEvents = isOverview || types.includes("event");
  const needsArchives = isOverview || types.includes("archive");
  const needsMeetings = isOverview || types.includes("meeting");
  const cursor: Cursor = activeType && rawCursor[activeType]
    ? { [activeType]: rawCursor[activeType] }
    : {};

  const projectRecords = await withDbRetry(() =>
    prisma.project.findMany({
      where: {
        ...(canViewAll
          ? {}
          : canViewSpace
            ? { spaceId: DEFAULT_SPACE_ID }
            : { members: { some: { userId } } }),
        ...(requestedProjectIds.length ? { id: { in: requestedProjectIds } } : {}),
        ...(status.length ? { status: { in: status } } : {}),
      },
      select: { id: true, name: true, color: true, status: true, tags: true },
      orderBy: { updatedAt: "desc" },
    })
  );
  const availableTags = [...new Set(projectRecords.flatMap((project) => project.tags?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? []))].sort((left, right) => left.localeCompare(right, "ko"));
  const projects = requestedTag
    ? projectRecords.filter((project) => project.tags?.split(",").map((tag) => tag.trim()).includes(requestedTag))
    : projectRecords;
  const projectFilters = projects.map((project) =>
    Object.fromEntries(Object.entries(project).filter(([key]) => key !== "tags")),
  );
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) {
    return NextResponse.json({
      items: [],
      nextCursor: null,
      filters: { projects: projectFilters, tags: availableTags },
      summary: {
        counts: { task: 0, event: 0, archive: 0, meeting: 0 },
        kanban: [],
        events: [],
        documents: [],
        recentUpdates: [],
      },
    });
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const [taskCount, eventCount, archiveCount, meetingCount, kanbanColumns] = await withDbRetry(() =>
    Promise.all([
      needsTasks ? prisma.task.count({
        where: { column: { projectId: { in: projectIds } } },
      }) : 0,
      needsEvents ? prisma.event.count({
        where: { projectId: { in: projectIds }, startDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
      }) : 0,
      needsArchives ? prisma.archivePost.count({
        where: {
          projectId: { in: projectIds },
          kind: { not: "MEETING" },
          ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
        },
      }) : 0,
      needsMeetings ? prisma.archivePost.count({
        where: {
          projectId: { in: projectIds },
          kind: "MEETING",
          ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
        },
      }) : 0,
      needsTasks ? prisma.kanbanColumn.findMany({
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
      }) : [],
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
  const overview = isOverview ? await withDbRetry(() =>
    Promise.all([
      prisma.event.findMany({
        where: { projectId: { in: projectIds }, startDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
        select: { id: true, title: true, startDate: true, projectId: true, creator: { select: { name: true } } },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        take: 5,
      }),
      prisma.archivePost.findMany({
        where: {
          projectId: { in: projectIds },
          kind: { not: "MEETING" },
          ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
        },
        select: { id: true, title: true, kind: true, visibility: true, updatedAt: true, projectId: true, author: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
      prisma.task.findMany({
        where: { column: { projectId: { in: projectIds } } },
        select: { id: true, title: true, dueDate: true, updatedAt: true, priority: true, column: { select: { name: true, projectId: true } }, assignee: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
      prisma.event.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, title: true, startDate: true, updatedAt: true, projectId: true, creator: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
      prisma.archivePost.findMany({
        where: {
          projectId: { in: projectIds },
          ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
        },
        select: { id: true, title: true, kind: true, visibility: true, updatedAt: true, projectId: true, author: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
    ])
  ) : null;

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
      !isOverview && types.includes("event")
        ? prisma.event.findMany({
        where: { projectId: { in: projectIds }, startDate: dayRange ? { gte: dayRange.start, lte: dayRange.end } : undefined },
            select: { id: true, title: true, startDate: true, endDate: true, projectId: true, creator: { select: { name: true } } },
            orderBy: [{ startDate: "asc" }, { id: "asc" }],
            cursor: cursor.event ? { id: cursor.event } : undefined,
            skip: cursor.event ? 1 : 0,
            take: limit + 1,
          })
        : [],
      !isOverview && types.includes("archive")
        ? prisma.archivePost.findMany({
            where: {
              projectId: { in: projectIds },
              kind: { not: "MEETING" },
              ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
              ...(recentRange ? { updatedAt: { gte: recentRange.start, lte: recentRange.end } } : {}),
            },
            select: { id: true, title: true, kind: true, visibility: true, updatedAt: true, projectId: true, author: { select: { name: true } } },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            cursor: cursor.archive ? { id: cursor.archive } : undefined,
            skip: cursor.archive ? 1 : 0,
            take: limit + 1,
          })
        : [],
      !isOverview && types.includes("meeting")
        ? prisma.archivePost.findMany({
            where: {
              projectId: { in: projectIds },
              kind: "MEETING",
              ...(canViewArchiveAll ? {} : { OR: [{ authorId: userId }, { visibility: { not: "PRIVATE" } }] }),
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

  const page = isOverview ? [] : items.slice(0, limit);
  const nextCursorState = page.reduce<Cursor>((current, item) => ({ ...current, [item.type]: item.id }), { ...cursor });
  const returnedCounts = page.reduce<Partial<Record<ItemType, number>>>((counts, item) => ({ ...counts, [item.type]: (counts[item.type] ?? 0) + 1 }), {});
  const hasMore = !isOverview && (tasks.length > (returnedCounts.task ?? 0)
    || events.length > (returnedCounts.event ?? 0)
    || archives.length > (returnedCounts.archive ?? 0)
    || meetings.length > (returnedCounts.meeting ?? 0));
  const nextCursor = hasMore ? Buffer.from(JSON.stringify(nextCursorState)).toString("base64url") : null;
  return NextResponse.json({
    items: page,
    nextCursor,
    filters: { projects: projectFilters, tags: availableTags },
    summary: {
      counts: { task: taskCount, event: eventCount, archive: archiveCount, meeting: meetingCount },
      kanban,
      events: overview?.[0].map((event) => ({
        id: event.id,
        type: "event" as const,
        title: event.title,
        timestamp: event.startDate.toISOString(),
        dueDate: event.startDate.toISOString(),
        authorName: event.creator.name,
        href: `/dashboard/projects/${event.projectId}/schedule`,
        project: projectById.get(event.projectId)!,
      })) ?? [],
      documents: overview?.[1].map((post) => ({
        id: post.id,
        type: post.kind === "MEETING" ? "meeting" as const : "archive" as const,
        title: post.title,
        timestamp: post.updatedAt.toISOString(),
        visibility: post.visibility,
        authorName: post.author.name,
        href: `/dashboard/projects/${post.projectId}/archive/${post.id}`,
        project: projectById.get(post.projectId)!,
      })) ?? [],
      recentUpdates: overview ? selectRecentUpdates([
        ...overview[2].map((task) => ({
          id: task.id,
          type: "task" as const,
          title: task.title,
          timestamp: task.updatedAt.toISOString(),
          dueDate: task.dueDate?.toISOString() ?? null,
          priority: task.priority,
          status: task.column.name,
          assigneeName: task.assignee?.name ?? null,
          href: `/dashboard/projects/${task.column.projectId}/kanban`,
          project: projectById.get(task.column.projectId)!,
        })),
        ...overview[3].map((event) => ({
          id: event.id,
          type: "event" as const,
          title: event.title,
          timestamp: event.updatedAt.toISOString(),
          dueDate: event.startDate.toISOString(),
          authorName: event.creator.name,
          href: `/dashboard/projects/${event.projectId}/schedule`,
          project: projectById.get(event.projectId)!,
        })),
        ...overview[4].map((post) => ({
          id: post.id,
          type: post.kind === "MEETING" ? "meeting" as const : "archive" as const,
          title: post.title,
          timestamp: post.updatedAt.toISOString(),
          visibility: post.visibility,
          authorName: post.author.name,
          href: `/dashboard/projects/${post.projectId}/archive/${post.id}`,
          project: projectById.get(post.projectId)!,
        })),
      ]) : [],
    },
  });
}