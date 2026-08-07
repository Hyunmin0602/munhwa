import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectMember } from "@/lib/server-utils";

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

    const data = await req.json();
    const event = await withDbRetry(() =>
      prisma.event.update({
        where: { id: eventId },
        data: {
          title: data.title,
          description: data.description,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          allDay: data.allDay,
          color: data.color,
        },
      })
    );
    return NextResponse.json(event);
  } catch (error) {
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
