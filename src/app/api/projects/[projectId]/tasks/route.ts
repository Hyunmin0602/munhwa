import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/server-utils";
import { withDbRetry } from "@/lib/db-retry";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/tasks] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;
    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const tasks = await withDbRetry(() =>
      prisma.task.findMany({
        where: { column: { projectId } },
        include: { assignee: { select: { id: true, name: true } }, column: true },
        orderBy: { order: "asc" },
      })
    );
    return NextResponse.json(tasks);
  } catch (error) {
    logApiError("GET", error);
    return NextResponse.json({ error: "태스크 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const { title, description, columnId, assigneeId, priority, dueDate } = await req.json();
    if (!title || !columnId) return NextResponse.json({ error: "title/columnId required" }, { status: 400 });

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const column = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!column) return NextResponse.json({ error: "Column not found" }, { status: 404 });

    if (assigneeId) {
      const assigneeMember = await withDbRetry(() =>
        prisma.projectMember.findUnique({ where: { userId_projectId: { userId: assigneeId, projectId } } })
      );
      if (!assigneeMember) return NextResponse.json({ error: "Assignee is not a project member" }, { status: 400 });
    }

    const count = await withDbRetry(() => prisma.task.count({ where: { columnId } }));

    const task = await withDbRetry(() =>
      prisma.task.create({
        data: {
          title,
          description,
          columnId,
          creatorId: userId,
          assigneeId: assigneeId ?? null,
          priority: priority ?? "medium",
          dueDate: dueDate ? new Date(dueDate) : null,
          order: count,
        },
        include: { assignee: { select: { id: true, name: true } } },
      })
    );
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "태스크 생성에 실패했습니다." }, { status: 500 });
  }
}
