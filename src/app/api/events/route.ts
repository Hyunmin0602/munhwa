import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/db-retry";
import { DEFAULT_SPACE_ID, assertAdmin, assertProjectMember, assertSpaceManager } from "@/lib/server-utils";
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
    const [spaceIds, projects] = await Promise.all([
      accessibleSpaceIds(userId),
      prisma.project.findMany({ where: { OR: [{ members: { some: { userId } } }, { space: { adminUserId: userId } }] }, select: { id: true } }),
    ]);
    const projectIds = projects.map((project) => project.id);
    const events = await withDbRetry(() => prisma.event.findMany({
      where: { OR: [{ scope: "SPACE", spaceId: { in: spaceIds } }, { scope: "PROJECT", projectId: { in: projectIds } }, { scope: "PERSONAL", creatorId: userId }] },
      include: { project: { select: { id: true, name: true, color: true } }, creator: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
    }));
    return NextResponse.json(events);
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
    let projectId: string | null = null;
    let spaceId = typeof data.spaceId === "string" && data.spaceId ? data.spaceId : null;

    if (scope === "PROJECT") {
      if (!requestedProjectId || !(await assertProjectMember(userId, requestedProjectId))) return NextResponse.json({ error: "사업 일정에 접근할 수 없습니다." }, { status: 403 });
      const project = await prisma.project.findUnique({ where: { id: requestedProjectId }, select: { spaceId: true } });
      if (!project?.spaceId) return NextResponse.json({ error: "사업의 space 정보를 찾을 수 없습니다." }, { status: 400 });
      projectId = requestedProjectId;
      spaceId = project.spaceId;
    } else {
      spaceId ??= DEFAULT_SPACE_ID;
      const allowed = (await accessibleSpaceIds(userId)).includes(spaceId);
      if (!allowed && !(await assertSpaceManager(userId, spaceId))) return NextResponse.json({ error: "해당 space에 일정을 등록할 수 없습니다." }, { status: 403 });
    }

    const event = await withDbRetry(() => prisma.event.create({ data: { title, description, startDate: start, endDate: end, allDay, color, type, scope, spaceId, projectId, creatorId: userId }, include: { project: { select: { id: true, name: true, color: true } } } }));
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/events] POST failed", error);
    return NextResponse.json({ error: "일정 생성에 실패했습니다." }, { status: 500 });
  }
}
