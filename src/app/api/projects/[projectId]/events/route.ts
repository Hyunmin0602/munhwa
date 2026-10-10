import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember, recordActivity } from "@/lib/server-utils";
import { eventAllDay, eventDates, eventScope, eventType, InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/events] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const events = await withDbRetry(() =>
      prisma.event.findMany({
        where: { projectId },
        include: { creator: { select: { id: true, name: true } }, label: { select: { id: true, name: true, description: true, color: true } } },
        orderBy: { startDate: "asc" },
      })
    );
    return NextResponse.json(events);
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "일정 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const data = await readJsonObject(req);
    const title = requiredText(data.title, "일정 제목", 100);
    const description = optionalText(data.description, "일정 설명", 2_000);
    const { start, end } = eventDates(data.startDate, data.endDate);
    const allDay = eventAllDay(data.allDay);
    const color = projectColor(data.color);
    const type = eventType(data.type);
    const scope = eventScope(data.scope);
    const requestedLabelId = typeof data.labelId === "string" && data.labelId.trim() ? data.labelId.trim() : null;
    if (scope !== "PROJECT") return NextResponse.json({ error: "사업 일정은 사업별 공개 범위만 사용할 수 있습니다." }, { status: 400 });
    const project = await withDbRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true } }));
    if (!project?.spaceId) return NextResponse.json({ error: "사업의 space 정보를 찾을 수 없습니다." }, { status: 400 });
    const spaceId = project.spaceId;
    const label = requestedLabelId
      ? await withDbRetry(() => prisma.eventLabel.findUnique({ where: { id: requestedLabelId }, select: { id: true, color: true } }))
      : null;
    if (requestedLabelId && !label) return NextResponse.json({ error: "존재하지 않는 라벨입니다." }, { status: 400 });

    const event = await withDbRetry(() =>
      prisma.event.create({
        data: {
          title,
          description,
          startDate: start,
          endDate: end,
          allDay,
          color: label?.color ?? color,
          labelId: label?.id ?? null,
          type,
          scope,
          spaceId,
          projectId,
          creatorId: userId,
        },
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
