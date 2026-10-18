import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import { del } from "@vercel/blob";
import { withDbReadRetry, withDbWrite } from "@/lib/db-retry";
import { canReadArchivePost, normalizeArchiveVisibility } from "@/lib/archive-visibility";
import { assertProjectEditor, assertProjectMember, canManageProject, canViewAllArchivePosts, recordActivity } from "@/lib/server-utils";

function logApiError(action: string, error: unknown) {
  console.error(`[api/projects/:projectId/archive/:postId] ${action} failed`, error);
}

import { InputValidationError, MAX_JSON_BODY_BYTES, readJsonObject, requiredText } from "@/lib/validation";
import { internalError, validationError } from "@/lib/api-error";
import { isLocalArchiveImage, removeLocalArchiveImage } from "@/lib/archive-image-storage";

import { createInAppNotification } from "@/lib/notifications";

type Params = { params: Promise<{ projectId: string; postId: string }> };

function normalizeArchiveKind(value: unknown) {
  return value === "MEETING" ? "MEETING" : "DOCUMENT";
}

export async function GET(_: NextRequest, { params }: Params) {
  const { projectId, postId } = await params;
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  if (!(await assertProjectMember(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const canViewAll = await canViewAllArchivePosts(userId, projectId);

  const post = await withDbReadRetry(
    () =>
      prisma.archivePost.findFirst({
        where: { id: postId, projectId },
        include: {
          author: { select: { id: true, name: true } },
          collaborators: { select: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
    { operation: `archive:get:${postId}` }
  );
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canReadArchivePost({ ...post, collaborators: post.collaborators.map(({ user }) => ({ userId: user.id })) }, userId, canViewAll)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canManage = await canManageProject(userId, projectId);

    const existing = await withDbReadRetry(() => prisma.archivePost.findFirst({
      where: { id: postId, projectId },
      include: { collaborators: { select: { userId: true } } },
    }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isCollaborator = existing.collaborators.some(({ userId: collaboratorId }) => collaboratorId === userId);
    if (!canManage && existing.visibility === "PRIVATE" && existing.authorId !== userId && !isCollaborator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await readJsonObject(req);
    const title = data.title === undefined ? undefined : requiredText(data.title, "문서 제목", 200);
    const content = data.content;
    if (content !== undefined && (typeof content !== "string" || content.length > MAX_JSON_BODY_BYTES || content.includes("\0"))) {
      return validationError("올바른 문서 본문이 필요합니다.");
    }
    if (data.kind !== undefined && data.kind !== "DOCUMENT" && data.kind !== "MEETING") return validationError("문서 유형이 올바르지 않습니다.");
    if (data.visibility !== undefined && (typeof data.visibility !== "string" || !["PRIVATE", "INTERNAL", "EXTERNAL", "PUBLIC"].includes(data.visibility))) return validationError("공개 범위가 올바르지 않습니다.");
    if (data.published !== undefined && typeof data.published !== "boolean") return validationError("공개 여부가 올바르지 않습니다.");
    if (data.expectedUpdatedAt !== undefined && typeof data.expectedUpdatedAt !== "string") return validationError("문서 수정 시각이 올바르지 않습니다.");
    if (data.shareAction !== undefined && data.shareAction !== "revoke" && data.shareAction !== "regenerate") return validationError("공유 작업이 올바르지 않습니다.");
    if (typeof data.expectedUpdatedAt === "string" && existing.updatedAt.toISOString() !== data.expectedUpdatedAt) {
      return NextResponse.json({ error: "다른 사용자가 문서를 먼저 수정했습니다. 최신 내용을 불러온 뒤 다시 저장해주세요." }, { status: 409 });
    }
    if (!canManage && existing.visibility === "EXTERNAL" && existing.authorId !== userId && !isCollaborator) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (data.shareAction === "revoke") {
      const post = await withDbWrite(() =>
        prisma.archivePost.update({ where: { id: postId }, data: { shareEnabled: false } })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 해제", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    if (data.shareAction === "regenerate") {
      const post = await withDbWrite(() =>
        prisma.archivePost.update({
          where: { id: postId },
          data: { shareEnabled: true, shareToken: uuidv4().replace(/-/g, "") },
        })
      );
      await recordActivity({ actorId: userId, projectId, type: "문서", action: "공유 설정", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title });
      return NextResponse.json(post);
    }
    const nextVisibility = normalizeArchiveVisibility(data.visibility ?? (data.published !== undefined ? (data.published ? "EXTERNAL" : "PRIVATE") : existing.visibility));
    const post = await withDbWrite(() =>
      prisma.archivePost.update({
        where: { id: postId },
        data: {
          title,
          content,
          kind: normalizeArchiveKind(data.kind ?? existing.kind),
          visibility: nextVisibility,
          shareEnabled: nextVisibility === "EXTERNAL",
          shareToken: nextVisibility === "EXTERNAL" ? (existing.shareToken ?? uuidv4().replace(/-/g, "")) : null,
          published: nextVisibility === "EXTERNAL",
          publishedAt: nextVisibility === "EXTERNAL" ? (existing.publishedAt ?? new Date()) : null,
        },
      })
    );
    await recordActivity({ actorId: userId, projectId, type: "문서", action: "수정", entityType: "ARCHIVE_POST", entityId: post.id, title: post.title, beforeData: { title: existing.title, content: existing.content, kind: existing.kind, visibility: existing.visibility }, afterData: { title: post.title, content: post.content, kind: post.kind, visibility: post.visibility } });
    if (post.kind === "MEETING" && post.visibility !== "PRIVATE" && (existing.kind !== "MEETING" || existing.visibility === "PRIVATE")) {
      const members = await withDbReadRetry(() => prisma.projectMember.findMany({ where: { projectId, userId: { not: userId } }, select: { userId: true } }));
      const project = await withDbReadRetry(() => prisma.project.findUnique({ where: { id: projectId }, select: { name: true, ownerId: true } }));
      if (project) {
        const recipients = [...new Set([...members.map((member) => member.userId), project.ownerId].filter((id): id is string => !!id && id !== userId))];
        await Promise.all(recipients.map((recipientId) => createInAppNotification({ recipientId, actorId: userId, category: "meeting", title: "회의록이 공유되었습니다.", body: `${project.name} · ${post.title}`, href: `/dashboard/projects/${projectId}/archive/${post.id}` })));
      }
    }
    return NextResponse.json(post);
  } catch (error) {
    if (error instanceof InputValidationError) return validationError(error.message);
    logApiError("PATCH", error);
    return internalError("문서 수정에 실패했습니다.");
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const { projectId, postId } = await params;
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    if (!(await assertProjectEditor(userId, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const canManage = await canManageProject(userId, projectId);

    const existing = await withDbReadRetry(() => prisma.archivePost.findFirst({ where: { id: postId, projectId } }));
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canManage && (existing.visibility === "PRIVATE" || existing.visibility === "EXTERNAL") && existing.authorId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const images = await withDbReadRetry(() => prisma.archiveImage.findMany({ where: { postId }, select: { url: true, storageKey: true } }));
    const remoteImages = images.filter((image) => !isLocalArchiveImage(image.url));
    if (remoteImages.length > 0 && !process.env.BLOB_READ_WRITE_TOKEN) return internalError("첨부 이미지를 삭제할 수 없습니다.");
    if (remoteImages.length > 0) await del(remoteImages.map((image) => image.url));
    for (const image of images.filter((image) => isLocalArchiveImage(image.url))) await removeLocalArchiveImage(image.storageKey, image.url);
    await withDbWrite(() => prisma.$transaction(async (tx) => {
      await tx.archivePostCollaborator.deleteMany({ where: { postId } });
      await tx.archiveImage.deleteMany({ where: { postId } });
      await tx.archivePost.delete({ where: { id: postId } });
    }));
    await recordActivity({ actorId: userId, projectId, type: "문서", action: "삭제", entityType: "ARCHIVE_POST", entityId: postId, title: existing.title, beforeData: { title: existing.title, content: existing.content, kind: existing.kind, visibility: existing.visibility } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logApiError("DELETE", error);
    return NextResponse.json({ error: "문서 삭제에 실패했습니다." }, { status: 500 });
  }
}
