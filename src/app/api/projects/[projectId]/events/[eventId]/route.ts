import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember } from "@/lib/server-utils";
import { eventAllDay, eventDates, InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/events/:eventId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; eventId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, eventId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.event.findFirst({ where: { id: eventId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await readJsonObject(req);
    const title = requiredText(data.title, "일정 제목", 100);
    const description = optionalText(data.description, "일정 설명", 2_000);
    const { start, end } = eventDates(data.startDate, data.endDate);
    const allDay = eventAllDay(data.allDay);
    const color = projectColor(data.color);
    const event = await withDbRetry(() =>
      prisma.event.update({
        where: { id: eventId },
        data: {
          title,
          description,
          startDate: start,
          endDate: end,
          allDay,
          color,
        },
      })
    );
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logApiError("PATCH", error);
    return NextResponse.json({ error: "일정 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, eventId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.event.findFirst({ where: { id: eventId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbRetry(() => prisma.event.delete({ where: { id: eventId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "일정 삭제에 실패했습니다." }, { status: 500 });
  }
}
