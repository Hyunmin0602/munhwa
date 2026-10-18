import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectEditor, assertProjectMember, recordActivity } from "@/lib/server-utils";
import { eventAllDay, eventDates, eventScope, eventType, InputValidationError, optionalText, readJsonObject, requiredText } from "@/lib/validation";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/events] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const events = await withDbReadRetry(() =>
      prisma.event.findMany({
        where: { projectId },
        include: { project: { select: { color: true } }, creator: { select: { id: true, name: true } }, label: { select: { id: true, name: true, description: true, color: true } } },
        orderBy: { startDate: "asc" },
      })
    );
    const tasks = await withDbReadRetry(() => prisma.task.findMany({
      where: { dueDate: { not: null }, column: { projectId } },
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
        projectId, project: task.column.project,
        label: { id: `kanban-${status ?? task.column.name}`, name: statusName, description: null, color: statusColor },
      };
    });
    return NextResponse.json([...events, ...taskEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()));
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "일정 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = await readJsonObject(req);
    const title = requiredText(data.title, "일정 제목", 100);
    const description = optionalText(data.description, "일정 설명", 2_000);
    const { start, end } = eventDates(data.startDate, data.endDate);
    const allDay = eventAllDay(data.allDay);
    const type = eventType(data.type);
    const scope = eventScope(data.scope);
    const requestedLabelId = typeof data.labelId === "string" && data.labelId.trim() ? data.labelId.trim() : null;
    if (scope !== "PROJECT") return NextResponse.json({ error: "사업 일정은 사업별 공개 범위만 사용할 수 있습니다." }, { status: 400 });
    const project = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true, color: true } }));
    if (!project?.spaceId) return NextResponse.json({ error: "사업의 space 정보를 찾을 수 없습니다." }, { status: 400 });
    const spaceId = project.spaceId;
    const label = requestedLabelId
      ? await withDbReadRetry(() => prisma.eventLabel.findUnique({ where: { id: requestedLabelId }, select: { id: true, color: true } }))
      : null;
    if (requestedLabelId && !label) return NextResponse.json({ error: "존재하지 않는 라벨입니다." }, { status: 400 });

    const event = await withDbWrite(() =>
      prisma.event.create({
        data: {
          title,
          description,
          startDate: start,
          endDate: end,
          allDay,
          color: label?.color ?? project.color,
          labelId: label?.id ?? null,
          type,
          scope,
          spaceId,
          projectId,
          creatorId: userId,
        },
        include: { project: { select: { color: true } }, label: { select: { id: true, name: true, description: true, color: true } } },
      })
    );
    await recordActivity({ actorId: userId, projectId, type: "일정", action: "생성", entityType: "EVENT", entityId: event.id, title: event.title, afterData: { title: event.title, startDate: event.startDate, endDate: event.endDate, allDay: event.allDay, labelId: event.labelId } });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logApiError("POST", error);
    return NextResponse.json({ error: "일정 생성에 실패했습니다." }, { status: 500 });
  }
}
