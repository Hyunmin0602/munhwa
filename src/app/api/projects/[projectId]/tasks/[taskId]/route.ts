import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { prisma } from "@/lib/prisma";
import { assertProjectEditor, assertProjectMember, assertSpaceManager, recordActivity } from "@/lib/server-utils";
import { apiError, forbidden, internalError, notFound, unauthorized } from "@/lib/api-error";
import { InputValidationError, readJsonObject, requiredText } from "@/lib/validation";
import { createInAppNotification } from "@/lib/notifications";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/tasks/:taskId] ${action} failed`, error);
}

type Params = { params: Promise<{ projectId: string; taskId: string }> };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { projectId, taskId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    if (!(await assertProjectMember(session.user.id, projectId))) return forbidden();
    const task = await withDbReadRetry(() => prisma.task.findFirst({
      where: { id: taskId, column: { projectId } },
      include: {
        assignee: { select: { id: true, name: true } },
        comments: { select: { id: true, content: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      },
    }));
    return task ? NextResponse.json(task) : notFound("칸반 카드를 찾을 수 없습니다.");
  } catch {
    return internalError("칸반 카드 정보를 불러오지 못했습니다.");
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId, taskId } = await params;
    const session = await auth();
    if (!session?.user?.id) return unauthorized();
    const userId = session.user.id;
    if (!(await assertProjectEditor(userId, projectId))) return forbidden();
    const task = await withDbReadRetry(() => prisma.task.findFirst({ where: { id: taskId, column: { projectId } }, select: { id: true } }));
    if (!task) return notFound("칸반 카드를 찾을 수 없습니다.");
    const data = await readJsonObject(req);
    const content = requiredText(data.commentContent, "코멘트", 2_000);
    const rawMentionIds = data.mentionUserIds === undefined ? [] : data.mentionUserIds;
    if (!Array.isArray(rawMentionIds) || rawMentionIds.length > 20 || rawMentionIds.some((id) => typeof id !== "string")) {
      return apiError("VALIDATION_ERROR", "멘션 대상이 올바르지 않습니다.", 400);
    }
    const mentionIds = [...new Set(rawMentionIds as string[])].filter((id) => id !== userId);
    const [project, projectMembers] = await Promise.all([
      withDbReadRetry(() => prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, ownerId: true, space: { select: { adminUserId: true, members: { where: { role: { in: ["manager", "space_manager"] } }, select: { userId: true } } } } },
      })),
      mentionIds.length ? withDbReadRetry(() => prisma.projectMember.findMany({ where: { projectId, userId: { in: mentionIds } }, select: { userId: true } })) : Promise.resolve([]),
    ]);
    const mentionableIds = new Set([
      ...projectMembers.map((member) => member.userId),
      ...(project?.space?.members.map((member) => member.userId) ?? []),
      project?.ownerId,
      project?.space?.adminUserId,
    ].filter((id): id is string => typeof id === "string"));
    if (!project || mentionIds.some((id) => !mentionableIds.has(id))) return apiError("VALIDATION_ERROR", "사업 구성원만 멘션할 수 있습니다.", 400);
    const comment = await withDbWrite(() => prisma.taskComment.create({
        data: { taskId, authorId: userId, content },
        select: { id: true, content: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true } } },
      }));
    if (mentionIds.length) {
      try {
        const preferences = await withDbReadRetry(() => prisma.notificationPreference.findMany({ where: { userId: { in: mentionIds }, mentionNotifications: false }, select: { userId: true } }));
        const disabledIds = new Set(preferences.map((item) => item.userId));
        const notificationRows = mentionIds.filter((id) => !disabledIds.has(id)).map((recipientId) => ({
          recipientId,
          actorId: userId,
          type: "TASK_MENTION",
          title: "카드 댓글에서 회원님을 멘션했습니다.",
          body: `${comment.author.name ?? "구성원"}님이 ${project.name} 사업 카드에 댓글을 남겼습니다.`,
          href: `/dashboard/projects/${projectId}/kanban?task=${taskId}`,
        }));
        if (notificationRows.length) await withDbWrite(() => prisma.notification.createMany({ data: notificationRows }));
      } catch (notificationError) {
        console.error("[task-comment] mention notifications failed after comment was saved", notificationError);
      }
    }
    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof InputValidationError) return apiError("VALIDATION_ERROR", error.message, 400);
    console.error("[task-comment] POST failed", error);
    return internalError("칸반 코멘트를 저장하지 못했습니다.");
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, taskId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbReadRetry(() => prisma.task.findFirst({ where: { id: taskId, column: { projectId } } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = await req.json();

    if (data.columnId) {
      const targetColumn = await withDbReadRetry(() =>
        prisma.kanbanColumn.findFirst({
          where: { id: data.columnId, projectId },
          select: { id: true },
        })
      );
      if (!targetColumn) return NextResponse.json({ error: "Target column not found" }, { status: 400 });
    }

    if (data.assigneeId) {
      const [assigneeMember, project] = await Promise.all([
        withDbReadRetry(() => prisma.projectMember.findUnique({ where: { userId_projectId: { userId: data.assigneeId, projectId } } })),
        withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { spaceId: true } })),
      ]);
      const isSpaceManager = project?.spaceId ? await assertSpaceManager(data.assigneeId, project.spaceId) : false;
      if (!assigneeMember && !isSpaceManager) return NextResponse.json({ error: "Assignee is not a project member" }, { status: 400 });
    }

    const dueDateValue = data.dueDate === null || data.dueDate === ""
      ? null
      : typeof data.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)
        ? new Date(`${data.dueDate}T00:00:00.000Z`)
        : data.dueDate !== undefined ? new Date(data.dueDate) : undefined;
    const task = await withDbWrite(() =>
      prisma.task.update({
        where: { id: taskId },
        data: {
          title: data.title,
          description: data.description,
          columnId: data.columnId,
          assigneeId: data.assigneeId,
          priority: data.priority,
          dueDate: dueDateValue,
          order: data.order,
        },
        include: { assignee: { select: { id: true, name: true } } },
      })
    );
    await recordActivity({ actorId: userId, projectId, type: "칸반", action: "수정", entityType: "TASK", entityId: task.id, title: task.title, beforeData: { title: existing.title, description: existing.description, priority: existing.priority, dueDate: existing.dueDate, columnId: existing.columnId, assigneeId: existing.assigneeId }, afterData: { title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate, columnId: task.columnId, assigneeId: task.assigneeId } });
    if (task.assigneeId && task.assigneeId !== existing.assigneeId && task.assigneeId !== userId) {
      const project = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }));
      if (project) await createInAppNotification({ recipientId: task.assigneeId, actorId: userId, category: "assignment", title: "새 업무가 배정되었습니다.", body: `${project.name} · ${task.title}`, href: `/dashboard/projects/${projectId}/kanban?task=${task.id}` });
    }
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

    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await withDbReadRetry(() => prisma.task.findFirst({ where: { id: taskId, column: { projectId } } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await withDbWrite(() => prisma.task.delete({ where: { id: taskId } }));
    await recordActivity({ actorId: userId, projectId, type: "칸반", action: "삭제", entityType: "TASK", entityId: taskId, title: existing.title, beforeData: { title: existing.title, description: existing.description, priority: existing.priority, dueDate: existing.dueDate, columnId: existing.columnId, assigneeId: existing.assigneeId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "태스크 삭제에 실패했습니다." }, { status: 500 });
  }
}
