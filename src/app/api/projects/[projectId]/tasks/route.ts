import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertProjectAccess, assertProjectEditor, assertSpaceManager, recordActivity } from "@/lib/server-utils";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { createInAppNotification } from "@/lib/notifications";

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

    const tasks = await withDbReadRetry(() =>
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

    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const column = await withDbReadRetry(() => prisma.kanbanColumn.findFirst({ where: { id: columnId, projectId } }));
    if (!column) return NextResponse.json({ error: "Column not found" }, { status: 404 });

    if (assigneeId) {
      const [assigneeMember, project] = await Promise.all([
        withDbReadRetry(() => prisma.projectMember.findUnique({ where: { userId_projectId: { userId: assigneeId, projectId } } })),
        withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true } })),
      ]);
      const isSpaceManager = project?.spaceId ? await assertSpaceManager(assigneeId, project.spaceId) : false;
      if (!assigneeMember && !isSpaceManager) return NextResponse.json({ error: "Assignee is not a project member" }, { status: 400 });
    }

    const count = await withDbReadRetry(() => prisma.task.count({ where: { columnId } }));

    const dueDateValue = typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      ? new Date(`${dueDate}T00:00:00.000Z`)
      : dueDate ? new Date(dueDate) : null;
    const task = await withDbWrite(() =>
      prisma.task.create({
        data: {
          title,
          description,
          columnId,
          creatorId: userId,
          assigneeId: assigneeId ?? null,
          priority: priority ?? "medium",
          dueDate: dueDateValue,
          order: count,
        },
        include: { assignee: { select: { id: true, name: true } } },
      })
    );
    await recordActivity({ actorId: userId, projectId, type: "칸반", action: "생성", entityType: "TASK", entityId: task.id, title: task.title, afterData: { title: task.title, priority: task.priority, dueDate: task.dueDate, columnId: task.columnId, assigneeId: task.assigneeId } });
    if (task.assigneeId && task.assigneeId !== userId) {
      const project = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }));
      if (project) await createInAppNotification({ recipientId: task.assigneeId, actorId: userId, category: "assignment", title: "새 업무가 배정되었습니다.", body: `${project.name} · ${task.title}`, href: `/dashboard/projects/${projectId}/kanban?task=${task.id}` });
    }
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    logApiError("POST", error);
    return NextResponse.json({ error: "태스크 생성에 실패했습니다." }, { status: 500 });
  }
}
