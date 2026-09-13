import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember } from "@/lib/server-utils";
import { eventAllDay, eventDates, InputValidationError, optionalText, projectColor, readJsonObject, requiredText } from "@/lib/validation";

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
        include: { creator: { select: { id: true, name: true } } },
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

    const event = await withDbRetry(() =>
      prisma.event.create({
        data: {
          title,
          description,
          startDate: start,
          endDate: end,
          allDay,
          color,
          projectId,
          creatorId: userId,
        },
      })
    );
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    logApiError("POST", error);
    return NextResponse.json({ error: "일정 생성에 실패했습니다." }, { status: 500 });
  }
}
