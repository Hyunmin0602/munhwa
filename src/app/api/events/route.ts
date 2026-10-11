import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertProjectEditor, assertSpaceManager, recordActivity } from "@/lib/server-utils";
import { eventActivityInputs } from "@/lib/activity-log";
import { eventAllDay, eventDates, eventScope, eventType, InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

async function accessibleSpaceIds(userId: string) {
  if (await assertAdmin(userId)) return (await prisma.space.findMany({ select: { id: true } })).map((space) => space.id);
  const spaces = await prisma.space.findMany({ where: { OR: [{ adminUserId: userId }, { members: { some: { userId } } }] }, select: { id: true } });
  return spaces.map((space) => space.id);
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const spaceIds = await accessibleSpaceIds(userId);
    const projects = await withDbReadRetry(() => prisma.project.findMany({
      where: {
        OR: [
          { members: { some: { userId } } },
          { ownerId: userId },
          { space: { adminUserId: userId } },
          { space: { members: { some: { userId, role: { in: ["manager", "space_manager"] } } } } },
          ...(spaceIds.length ? [{ isArchived: true, accessScope: "SPACE", spaceId: { in: spaceIds } }] : []),
        ],
      },
      select: { id: true, name: true, color: true },
    }));
    const projectIds = projects.map((project) => project.id);
    const events = await withDbReadRetry(() => prisma.event.findMany({
      where: { OR: [{ scope: "SPACE", spaceId: { in: spaceIds } }, { scope: "PROJECT", projectId: { in: projectIds } }, { scope: "PERSONAL", creatorId: userId }] },
      include: { project: { select: { id: true, name: true, color: true } }, creator: { select: { id: true, name: true } }, label: { select: { id: true, name: true, description: true, color: true } } },
      orderBy: { startDate: "asc" },
    }));
    const tasks = await withDbReadRetry(() => prisma.task.findMany({
      where: { dueDate: { not: null }, column: { projectId: { in: projectIds } } },
      select: { id: true, title: true, description: true, dueDate: true, column: { select: { name: true, integratedStatus: true, project: { select: { id: true, name: true, color: true } } } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }));
    const taskEvents = tasks.map((task) => {
      const status = task.column.integratedStatus;
      const statusName = status === "BEFORE" ? "진행 전" : status === "IN_PROGRESS" ? "진행 중" : status === "DONE" ? "완료" : task.column.name;
      const statusColor = status === "BEFORE" ? "#64748b" : status === "IN_PROGRESS" ? "#6366f1" : status === "DONE" ? "#10b981" : task.column.project.color;
      const dueDate = task.dueDate!;
      return {
        id: `task:${task.id}`, sourceTaskId: task.id, title: task.title, description: task.description,
        startDate: dueDate, endDate: dueDate, allDay: true, color: statusColor, scope: "PROJECT", type: "BUSINESS",
        projectId: task.column.project.id, project: task.column.project,
        label: { id: `kanban-${status ?? task.column.name}`, name: statusName, description: null, color: statusColor },
      };
    });
    return NextResponse.json([...events, ...taskEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
  } catch (error) {
    console.error("[api/events] GET failed", error);
    return NextResponse.json({ error: "일정 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const data = await readJsonObject(req);
    const title = requiredText(data.title, "일정 제목", 100);
    const description = optionalText(data.description, "일정 설명", 2_000);
    const { start, end } = eventDates(data.startDate, data.endDate);
    const allDay = eventAllDay(data.allDay);
    const color = projectColor(data.color);
    const type = eventType(data.type);
    const scope = eventScope(data.scope);
    const requestedProjectId = typeof data.projectId === "string" && data.projectId ? data.projectId : null;
    const requestedLabelId = typeof data.labelId === "string" && data.labelId.trim() ? data.labelId.trim() : null;
    let projectId: string | null = null;
    let spaceId = typeof data.spaceId === "string" && data.spaceId ? data.spaceId : null;
    let selectedProjectColor: string | null = null;
    const label = requestedLabelId
      ? await withDbReadRetry(() => prisma.eventLabel.findUnique({ where: { id: requestedLabelId }, select: { id: true, color: true } }))
      : null;
    if (requestedLabelId && !label) return NextResponse.json({ error: "존재하지 않는 라벨입니다." }, { status: 400 });

    if (scope === "PROJECT") {
      if (!requestedProjectId || !(await assertProjectEditor(userId, requestedProjectId))) return NextResponse.json({ error: "사업 일정에 접근할 수 없습니다." }, { status: 403 });
      const project = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: requestedProjectId }, select: { spaceId: true, color: true } }));
      if (!project?.spaceId) return NextResponse.json({ error: "사업의 space 정보를 찾을 수 없습니다." }, { status: 400 });
      projectId = requestedProjectId;
      spaceId = project.spaceId;
      selectedProjectColor = project.color;
    } else {
      spaceId ??= DEFAULT_SPACE_ID;
      const allowed = (await accessibleSpaceIds(userId)).includes(spaceId);
      if (!allowed && !(await assertSpaceManager(userId, spaceId))) return NextResponse.json({ error: "해당 space에 일정을 등록할 수 없습니다." }, { status: 403 });
    }

    const event = await withDbWrite(() => prisma.event.create({ data: { title, description, startDate: start, endDate: end, allDay, color: label?.color ?? selectedProjectColor ?? color, labelId: label?.id ?? null, type, scope, spaceId, projectId, creatorId: userId }, include: { project: { select: { id: true, name: true, color: true } }, label: { select: { id: true, name: true, description: true, color: true } } } }));
    for (const activity of eventActivityInputs(userId, null, event)) await recordActivity(activity);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/events] POST failed", error);
    return NextResponse.json({ error: "일정 생성에 실패했습니다." }, { status: 500 });
  }
}
