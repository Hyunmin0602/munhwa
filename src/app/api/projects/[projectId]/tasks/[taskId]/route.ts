import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbRetry } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/tasks/:taskId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, taskId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.task.findFirst({ where: { id: taskId, column: { projectId } } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await req.json();

    if (data.columnId) {
      const targetColumn = await withDbRetry(() => prisma.kanbanColumn.findFirst({ where: { id: data.columnId, projectId } }));
      if (!targetColumn) return NextResponse.json({ error: "Target column not found" }, { status: 400 });
    }

    if (data.assigneeId) {
      const assigneeMember = await withDbRetry(() =>
        prisma.projectMember.findUnique({ where: { userId_projectId: { userId: data.assigneeId, projectId } } })
      );
      if (!assigneeMember) return NextResponse.json({ error: "Assignee is not a project member" }, { status: 400 });
    }

    const task = await withDbRetry(() =>
      prisma.task.update({
        where: { id: taskId },
        data: {
          title: data.title,
          description: data.description,
          columnId: data.columnId,
          assigneeId: data.assigneeId,
          priority: data.priority,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          order: data.order,
        },
        include: { assignee: { select: { id: true, name: true } } },
      })
    );
    return NextResponse.json(task);
  } catch (error) {
    logApiError("PATCH", error);
    return NextResponse.json({ error: "태스크 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, taskId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectAccess(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbRetry(() => prisma.task.findFirst({ where: { id: taskId, column: { projectId } } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbRetry(() => prisma.task.delete({ where: { id: taskId } }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "태스크 삭제에 실패했습니다." }, { status: 500 });
  }
}
