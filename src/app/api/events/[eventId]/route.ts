import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { assertAdmin, assertProjectMember, assertSpaceManager } from "@/lib/server-utils";
import { eventAllDay, eventDates, eventScope, eventType, InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

type Params = { params: Promise<{ eventId: string }> };

async function canManageEvent(userId: string, event: { creatorId: string; projectId: string | null; spaceId: string | null }) {
  return event.creatorId === userId || (await assertAdmin(userId)) || (event.projectId ? await assertProjectMember(userId, event.projectId) : await assertSpaceManager(userId, event.spaceId ?? undefined));
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    const { eventId } = await params;

    const existing = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, creatorId: true, scope: true, spaceId: true, projectId: true, title: true, description: true, startDate: true, endDate: true, allDay: true, color: true, labelId: true, type: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canManageEvent(userId, existing))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

    let projectId: string | null = existing.projectId;
    let spaceId: string | null = existing.spaceId;

    if (scope === "PROJECT") {
      if (!requestedProjectId || !(await assertProjectMember(userId, requestedProjectId))) return NextResponse.json({ error: "사업 일정에 접근할 수 없습니다." }, { status: 403 });
      const project = await prisma.project.findUnique({ where: { id: requestedProjectId }, select: { spaceId: true } });
      if (!project?.spaceId) return NextResponse.json({ error: "사업의 space 정보를 찾을 수 없습니다." }, { status: 400 });
      projectId = requestedProjectId;
      spaceId = project.spaceId;
    } else {
      projectId = null;
      spaceId = existing.spaceId ?? null;
      if (scope === "SPACE") {
        const allowed = await assertSpaceManager(userId, spaceId ?? "");
        if (!allowed) return NextResponse.json({ error: "해당 space에 일정을 수정할 수 없습니다." }, { status: 403 });
      }
    }

    const label = requestedLabelId
      ? await withDbRetry(() => prisma.eventLabel.findUnique({ where: { id: requestedLabelId }, select: { id: true, color: true } }))
      : null;
    if (requestedLabelId && !label) return NextResponse.json({ error: "존재하지 않는 라벨입니다." }, { status: 400 });

    const event = await withDbRetry(() => prisma.event.update({
      where: { id: eventId },
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
        projectId,
        spaceId,
      },
      include: { project: { select: { id: true, name: true, color: true } }, label: { select: { id: true, name: true, description: true, color: true } } },
    }));
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/events/:eventId] PATCH failed", error);
    return NextResponse.json({ error: "일정 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { creatorId: true, scope: true, spaceId: true, projectId: true } });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canManage = event.creatorId === userId
    || await assertAdmin(userId)
    || (event.projectId ? await assertProjectMember(userId, event.projectId) : await assertSpaceManager(userId, event.spaceId ?? undefined));
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await withDbRetry(() => prisma.event.delete({ where: { id: eventId } }));
  return NextResponse.json({ ok: true });
}
