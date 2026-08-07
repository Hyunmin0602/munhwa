import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember } from "@/lib/server-utils";

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

    const { title, description, startDate, endDate, allDay, color } = await req.json();
    if (!title || !startDate || !endDate) return NextResponse.json({ error: "title/startDate/endDate required" }, { status: 400 });

    const event = await withDbRetry(() =>
      prisma.event.create({
        data: {
          title,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          allDay: allDay ?? false,
          color: color ?? "#6366f1",
          projectId,
          creatorId: userId,
        },
      })
    );
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "일정 생성에 실패했습니다." }, { status: 500 });
  }
}
