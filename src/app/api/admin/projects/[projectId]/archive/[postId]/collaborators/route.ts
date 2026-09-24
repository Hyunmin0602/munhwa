import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { assertProjectOwner, canManageCultureSportsContent } from "@/lib/server-utils";
import { forbidden, internalError, notFound, unauthorized, validationError } from "@/lib/api-error";

type Params = { params: Promise<{ projectId: string; postId: string }> };

async function requireProjectManager(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: unauthorized() };
  const canManage = (await assertProjectOwner(session.user.id, projectId)) || (await canManageCultureSportsContent(session.user.id));
  if (!canManage) return { response: forbidden() };
  return { userId: session.user.id };
}

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const access = await requireProjectManager(projectId);
  if ("response" in access) return access.response;

  try {
    const post = await withDbReadRetry(() => prisma.archivePost.findFirst({
      where: { id: postId, projectId },
      select: {
        id: true,
        collaborators: { select: { user: { select: { id: true, name: true, email: true } } } },
        project: { select: { members: { select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { joinedAt: "asc" } } } },
      },
    }));
    if (!post) return notFound("문서를 찾을 수 없습니다.");
    return NextResponse.json({ collaborators: post.collaborators.map(({ user }) => user), members: post.project.members.map(({ user }) => user) });
  } catch {
    return internalError("공동 수정자 정보를 불러오지 못했습니다.");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const access = await requireProjectManager(projectId);
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError("올바른 JSON 요청이 필요합니다.");
  }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const userIds = Array.isArray(payload.userIds) ? [...new Set(payload.userIds.filter((value): value is string => typeof value === "string"))] : null;
  if (!userIds || userIds.length > 20) return validationError("공동 수정자는 20명 이하로 지정할 수 있습니다.");

  try {
    const result = await withDbWrite(() => prisma.$transaction(async (tx) => {
      const post = await tx.archivePost.findFirst({ where: { id: postId, projectId }, select: { id: true } });
      if (!post) throw new Error("POST_NOT_FOUND");
      const validMembers = await tx.projectMember.findMany({ where: { projectId, userId: { in: userIds } }, select: { userId: true } });
      if (validMembers.length !== userIds.length) throw new Error("NOT_PROJECT_MEMBER");

      await tx.archivePostCollaborator.deleteMany({ where: { postId } });
      for (const userId of userIds) {
        await tx.archivePostCollaborator.create({ data: { id: randomUUID(), postId, userId } });
      }
      await tx.adminAuditLog.create({
        data: {
          id: randomUUID(),
          actorUserId: access.userId,
          spaceId: (await tx.project.findUnique({ where: { id: projectId }, select: { spaceId: true } }))?.spaceId,
          action: "ARCHIVE_COLLABORATORS_CHANGED",
          targetType: "ARCHIVE_POST",
          targetId: postId,
          afterData: JSON.stringify({ userIds }),
          reason: typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : null,
        },
      });
      return { userIds };
    }));
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "POST_NOT_FOUND") return notFound("문서를 찾을 수 없습니다.");
    if (code === "NOT_PROJECT_MEMBER") return validationError("공동 수정자는 해당 사업의 참여자여야 합니다.");
    return internalError("공동 수정자 저장에 실패했습니다.");
  }
}
